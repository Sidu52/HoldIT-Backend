import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { BOOKING_STATUS, JOB_QUEUES, STATUS_CODES } from "../../utils/constants.js";
import { addJobToQueue } from "../../services/jobService.js";
import {
    DRIVER_ASSIGN_QUEUE,
    DRIVER_JOB_NAMES,
    BOOKING_LIMITS,
    CANCELLABLE_STATUSES,
    RETURN_REQUESTABLE_STATUSES,
    ACTIVE_STATUSES,
    HISTORY_STATUSES,
    BOOKING_JOB_NAMES,
    BOOKING_SELECT,
    BOOKING_MESSAGES,
    PAYMENT_TIMEOUT_SECONDS,
    PAYMENT_FOLLOWUP_QUEUE,
    PAYMENT_FOLLOWUP_JOB_NAMES,
} from "../../constants/user/booking.js";
import {
    invalidateBookingCache,
    verifyUserForBooking,
    verifyServiceability,
    checkActiveBookingLimit,
    calculateTotalLuggage,
    findUserBooking,
    findMutableUserBooking,
    buildPagination,
    createTimelineEntry,
    queueBookingJob,
    releaseStoreCapacity,
    releaseDriver,
    findNearestAvailableStore,
    findNearbyDrivers,
    assignStoreToBooking,
    findStore,
    findDriver,
    processReturnBooking,
} from "../../helpers/user/bookingHelper.js";
import { STORE_MESSAGES } from "../../constants/user/store.js";
import { DRIVER_MESSAGES } from "../../constants/user/driver.js";
import { safeAbortSession } from "../../utils/helper.js";
import logger from "../../utils/logger.js";
import { getIO } from "../../src/socket/index.js";
import { emitBookingCreated, emitBookingStoreAssigned, emitStoreIncomingBooking, emitBookingReturnRequested } from "../../src/socket/emitters/booking.emitter.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import { getCache, setCache } from "../../constants/redis/redisOperation.js";
import { BookingKeys, BookingTTL } from "../../constants/redis/booking.keys.js";
import Store from "../../models/Store.js";
import PricingRule from "../../models/PricingRule.js";
import Payment, { PAYMENT_STATUS, PAYMENT_TYPE } from "../../models/Payment.js";
import { razorpay } from "../../config/razorpay.js";
import PricingService from "../../services/pricingService.js";
import Money from "../../utils/money.js";
import { calculateAdvanceAmount, calculateDeliveryDistanceCharge, calculateStorageFee } from "../../helpers/pricing/pricingHelper.js";
import { scheduleDriverSearch, scheduleReturnProcessing } from "../../helpers/driver/driver.js";
import { assignDriverToBooking } from "../../helpers/user/bookingHelper.js";
import { checkDriverAvailability } from "../../helpers/user/driverAssignHelper.js";

// Schedule a Booking
export const schedulePickup = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const { pickupLocation, luggage, notes, tipAmount, couponCode, userInfo } = req.body;
        const { firstName = "", lastName = "", phone = "" } = userInfo ?? {};

        // Step 1: Verify user
        const { valid, errorType } = await verifyUserForBooking(userId, session);
        if (!valid) {
            await safeAbortSession(session);
            return sendError(
                res,
                errorType === "NOT_FOUND" ? BOOKING_MESSAGES.USER_NOT_FOUND : BOOKING_MESSAGES.ACCOUNT_NOT_ACTIVE,
                errorType === "NOT_FOUND" ? STATUS_CODES.NOT_FOUND : STATUS_CODES.FORBIDDEN
            );
        }

        // Step 2: Serviceability
        const serviceabilityResult = await checkServiceability(pickupLocation.lng, pickupLocation.lat);
        if (!serviceabilityResult.isServiceable) {
            await safeAbortSession(session);
            return sendError(
                res,
                serviceabilityResult.error === "DB_ERROR" ? BOOKING_MESSAGES.SCHEDULE_FAILED : BOOKING_MESSAGES.NOT_SERVICEABLE,
                serviceabilityResult.error === "DB_ERROR" ? STATUS_CODES.INTERNAL_SERVER_ERROR : STATUS_CODES.FORBIDDEN
            );
        }
        const { serviceAreaId } = serviceabilityResult;

        // Step 3: Active booking limit
        const { hasReachedLimit } = await checkActiveBookingLimit(userId, session);
        if (hasReachedLimit) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.MAX_ACTIVE_REACHED(BOOKING_LIMITS.MAX_ACTIVE_BOOKINGS),
                STATUS_CODES.CONFLICT
            );
        }

        // Step 4: Validate store availability before payment
        const { store: nearestStore } = await findNearestAvailableStore(pickupLocation.lat, pickupLocation.lng, session);
        if (!nearestStore) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.NO_STORE_AVAILABLE, STATUS_CODES.NOT_FOUND);
        }

        // Step 5: Validate driver availability before payment
        const targetServiceArea = serviceAreaId ?? nearestStore.service_area_id;
        const isDriverAvailable = await checkDriverAvailability(targetServiceArea, pickupLocation.lat, pickupLocation.lng);
        if (!isDriverAvailable) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.NO_DRIVER_AVAILABLE_AREA, STATUS_CODES.NOT_FOUND);
        }

        const totalCount = calculateTotalLuggage(luggage);
        const rule = await PricingRule.getActiveRule(serviceAreaId ?? nearestStore.service_area_id).session(session);

        if (!rule) {
            await safeAbortSession(session);
            return sendError(res, "No active pricing rule found for this service area", STATUS_CODES.CONFLICT);
        }

        const storeCoords = {
            lat: nearestStore.location.coordinates[1],
            lng: nearestStore.location.coordinates[0],
        };

        const pricingSnapshot = PricingService.buildPricingSnapshot(rule, storeCoords);
        const advanceQuote = PricingService.calculateAdvanceQuote(pricingSnapshot, pickupLocation, storeCoords, luggage);
        const advanceAmountMajor = Money.fromMinor(advanceQuote.totalAmountMinor);

        // Coupon calculation
        let discount = 0;
        const normalizedCoupon = couponCode ? couponCode.trim().toUpperCase() : "";
        if (normalizedCoupon === "WELCOME50" || normalizedCoupon === "HOLDIT50" || normalizedCoupon === "AMZPAY50") {
            discount = Math.min(advanceAmountMajor, 50);
        } else if (normalizedCoupon === "WELCOME20") {
            discount = Math.min(50, +(advanceAmountMajor * 0.2).toFixed(2));
        } else if (normalizedCoupon === "HOLDIT10") {
            discount = Math.min(100, +(advanceAmountMajor * 0.1).toFixed(2));
        } else if (normalizedCoupon === "FREEBIE") {
            discount = Math.min(advanceAmountMajor, 25);
        }

        const payableAdvanceMajor = Math.max(0, +(advanceAmountMajor + (Number(tipAmount) || 0) - discount).toFixed(2));

        const [booking] = await Booking.create(
            [
                {
                    userId,
                    serviceAreaId: serviceAreaId ?? nearestStore.service_area_id,
                    status: BOOKING_STATUS.CREATED,
                    tipAmount,
                    couponCode: normalizedCoupon,
                    userInfo: { firstName, lastName, phone },
                    isActive: true,
                    pickupLocation: {
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        address: pickupLocation.address ?? "",
                    },
                    storageLocation: {
                        lat: storeCoords.lat,
                        lng: storeCoords.lng,
                        address: nearestStore.location.address || "",
                    },
                    luggage: { ...luggage, totalCount },
                    pricing: {
                        perHourRate: rule.hourlyStorageRate,
                        advanceAmount: payableAdvanceMajor,
                        discountAmount: discount,
                        advanceBreakdown: {
                            platformFee: Money.fromMinor(advanceQuote.breakdownMinor.platformFeeMinor),
                            deliveryFee: Money.fromMinor(advanceQuote.breakdownMinor.deliveryFeeMinor),
                            handlingFee: Money.fromMinor(advanceQuote.breakdownMinor.handlingFeeMinor),
                            packingFee: Money.fromMinor(advanceQuote.breakdownMinor.packingFeeMinor),
                        },
                        pickupDistanceKm: advanceQuote.distanceKm,
                        storageHours: 0,
                        distanceCharge: 0,
                        currency: rule.currency,
                        pricingRuleId: rule._id,
                        pricingSnapshot: {
                            ...pricingSnapshot,
                            pickupDistanceKm: advanceQuote.distanceKm,
                            pickupCustomerRateMinor: pricingSnapshot.perKmRateMinor,
                            pickupCustomerAmountMinor: advanceQuote.breakdownMinor.deliveryFeeMinor,
                        },
                    },
                    pickup: { scheduledAt: new Date(), assignment: { notes: notes ?? "" } },
                    timeline: [
                        createTimelineEntry(BOOKING_STATUS.CREATED, "Booking created by user", userId, "User"),
                    ],
                },
            ],
            { session }
        );

        let order;
        try {
            order = await razorpay.orders.create({
                amount: advanceQuote.totalAmountMinor, // paise integer
                currency: "INR",
                receipt: booking.bookingCode,
                notes: { bookingId: booking._id.toString(), userId: userId.toString(), type: PAYMENT_TYPE.ADVANCE },
            });
        } catch (rzpErr) {
            await safeAbortSession(session);
            logger.error("[schedulePickup] Razorpay order creation failed:", rzpErr);
            return sendError(res, BOOKING_MESSAGES.SCHEDULE_FAILED, STATUS_CODES.INTERNAL_SERVER_ERROR);
        }

        const [payment] = await Payment.create(
            [
                {
                    bookingId: booking._id,
                    userId,
                    type: PAYMENT_TYPE.ADVANCE,
                    razorpayOrderId: order.id,
                    amountMinor: order.amount,
                    amount: Money.fromMinor(order.amount),
                    currency: order.currency,
                    status: PAYMENT_STATUS.CREATED,
                },
            ],
            { session }
        );

        booking.status = BOOKING_STATUS.PAYMENT_PENDING;
        booking.timeline.push(
            createTimelineEntry(BOOKING_STATUS.PAYMENT_PENDING, "Awaiting advance payment", null, null)
        );
        await booking.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Enqueue auto-cancel job for abandoned payment after 10 minutes
        addJobToQueue(
            JOB_QUEUES.BOOKING_AUTO_CANCEL,
            {
                name: "AUTO_CANCEL_PAYMENT_PENDING",
                data: {
                    bookingId: booking._id.toString(),
                    reason: "Payment window expired (abandoned checkout)",
                },
            },
            {
                jobId: `auto-cancel-payment-pending-${booking._id}`,
                delay: PAYMENT_TIMEOUT_SECONDS * 60 * 1000, // 10 minutes
                removeOnComplete: true,
                removeOnFail: { count: 50 },
            }
        ).catch((err) =>
            logger.error("[schedulePickup] Auto-cancel job scheduling failed:", err.message)
        );

        invalidateBookingCache(userId).catch((err) =>
            logger.warn("[schedulePickup] Cache invalidation failed:", err.message)
        );

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Booking created — advance payment required",
            data: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: booking.status,
                luggage: { ...luggage, totalCount },
                payment: {
                    orderId: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    keyId: process.env.RAZORPAY_KEY_ID,
                    paymentDocId: payment._id,
                },
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[schedulePickup] Unhandled error:", err);
        return sendError(res, BOOKING_MESSAGES.SCHEDULE_FAILED);
    }
};

// controllers/payment.controller.js
export const retryPayment = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { bookingId } = req.params;

        const booking = await Booking.findOne({ _id: bookingId, userId });
        if (!booking) {
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        // Only bookings still genuinely waiting on payment are retryable —
        // anything else (already paid, cancelled, progressed) is a hard no.
        const retryableStatuses = [BOOKING_STATUS.PAYMENT_PENDING, BOOKING_STATUS.FINAL_PAYMENT_PENDING];
        if (!retryableStatuses.includes(booking.status)) {
            return sendError(
                res,
                `Booking is not awaiting payment (current status: ${booking.status})`,
                STATUS_CODES.CONFLICT
            );
        }

        const paymentType = booking.status === BOOKING_STATUS.PAYMENT_PENDING ? PAYMENT_TYPE.ADVANCE : PAYMENT_TYPE.FINAL;

        // Find the existing pending payment for this booking + type.
        const existingPayment = await Payment.findOne({
            bookingId: booking._id,
            type: paymentType,
            status: PAYMENT_STATUS.CREATED, // never captured, never failed-and-abandoned
        }).sort({ createdAt: -1 });
        if (!existingPayment) {
            return sendError(res, "No pending payment found for this booking", STATUS_CODES.NOT_FOUND);
        }

        // Exact amount in paise (integer)
        const amountMinor = existingPayment.amountMinor || Math.round(Number(existingPayment.amount || 0) * 100);

        // Razorpay orders have their own expiry (default ~1 hour, dashboard
        // configurable). If it's likely stale, create a fresh order rather
        // than handing the client a dead order_id.
        const orderAgeMinutes = (Date.now() - existingPayment.createdAt.getTime()) / 60000;
        const ORDER_STALE_THRESHOLD_MINUTES = 15;

        if (orderAgeMinutes < ORDER_STALE_THRESHOLD_MINUTES) {
            // Reuse the existing order — same amount in paise, same order_id.
            return sendResponse({
                res,
                statusCode: STATUS_CODES.CREATED,
                message: "Reusing existing payment order",
                data: {
                    orderId: existingPayment.razorpayOrderId,
                    amount: amountMinor, // MUST be paise integer for Razorpay Checkout SDK
                    amountMajor: existingPayment.amount || Money.fromMinor(amountMinor),
                    currency: existingPayment.currency || "INR",
                    keyId: process.env.RAZORPAY_KEY_ID,
                    paymentDocId: existingPayment._id,
                },
            });
        }

        // Order is stale — create a fresh Razorpay order for the SAME
        // amount in paise, and mark the old Payment doc as abandoned.
        let newOrder;
        try {
            newOrder = await razorpay.orders.create({
                amount: amountMinor, // paise integer, unchanged
                currency: existingPayment.currency || "INR",
                receipt: `${booking.bookingCode}-RETRY-${Date.now()}`,
                notes: { bookingId: booking._id.toString(), userId: userId.toString(), type: paymentType },
            });
        } catch (rzpErr) {
            logger.error("[retryPayment] Razorpay order creation failed:", rzpErr);
            return sendError(res, "Failed to create payment order", STATUS_CODES.INTERNAL_SERVER_ERROR);
        }

        existingPayment.status = PAYMENT_STATUS.FAILED;
        existingPayment.failureReason = "Superseded by retry — order expired";
        await existingPayment.save();

        const newPayment = await Payment.create({
            bookingId: booking._id,
            userId,
            type: paymentType,
            razorpayOrderId: newOrder.id,
            amountMinor: newOrder.amount,
            amount: Money.fromMinor(newOrder.amount),
            currency: newOrder.currency,
            status: PAYMENT_STATUS.CREATED,
        });

        // Re-arm the auto-cancel window from now, since the user is
        // actively engaged again
        await addJobToQueue(
            JOB_QUEUES.BOOKING_AUTO_CANCEL,
            {
                name: "AUTO_CANCEL_PAYMENT_PENDING",
                data: { bookingId: booking._id.toString(), reason: "Payment window expired (retry abandoned)" },
            },
            {
                jobId: `auto-cancel-payment-pending-${booking._id}-retry-${Date.now()}`,
                delay: PAYMENT_TIMEOUT_SECONDS * 60 * 1000,
                removeOnComplete: true,
                removeOnFail: { count: 50 },
            }
        ).catch((err) => logger.error("[retryPayment] Auto-cancel job scheduling failed:", err.message));

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "New payment order created",
            data: {
                orderId: newOrder.id,
                amount: newOrder.amount, // paise integer
                amountMajor: Money.fromMinor(newOrder.amount),
                currency: newOrder.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
                paymentDocId: newPayment._id,
            },
        });
    } catch (err) {
        logger.error("[retryPayment] Failed:", err);
        return sendError(res, "Failed to retry payment", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};


// GET MY BOOKINGS
export const getMyBookings = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        // Always read from validated query — middleware guarantees defaults
        const {
            page = 1,
            limit = 10,
            status,
            sort_order = "desc",
        } = req.validated?.query ?? req.query;

        const pageNum = Number(page);
        const limitNum = Math.min(Number(limit), BOOKING_LIMITS.MAX_PAGE_SIZE ?? 50);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        const cacheKey = BookingKeys.list(userId, pageNum, limitNum, status, sort_order);
        const cached = await getCache(cacheKey);
        if (cached) {
            return sendResponse({ res, message: BOOKING_MESSAGES.BOOKINGS_FETCHED, data: cached });
        }

        const filter = { userId };
        if (status) filter.status = status;

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select(BOOKING_SELECT.LIST)
                .sort({ createdAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const responseData = {
            bookings,
            pagination: buildPagination(pageNum, limitNum, total),
        };

        await setCache(cacheKey, responseData, BookingTTL.LIST);

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.BOOKINGS_FETCHED,
            data: responseData,
        });
    } catch (err) {
        logger.error("[getMyBookings] Error:", err);
        return sendError(res, BOOKING_MESSAGES.FETCH_FAILED);
    }
};

// GET BOOKING BY ID
export const getBookingById = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        const cacheKey = BookingKeys.detail(userId, booking_id);
        const cached = await getCache(cacheKey);
        if (cached) {
            return sendResponse({ res, message: BOOKING_MESSAGES.BOOKING_FETCHED, data: cached });
        }

        // findUserBooking returns a lean object — correct for reads
        const booking = await findUserBooking(booking_id, userId, BOOKING_SELECT.DETAIL);
        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await setCache(cacheKey, booking, BookingTTL.DETAIL);

        return sendResponse({ res, message: BOOKING_MESSAGES.BOOKING_FETCHED, data: booking });
    } catch (err) {
        logger.error("[getBookingById] Error:", err);
        return sendError(res, BOOKING_MESSAGES.FETCH_DETAIL_FAILED);
    }
};

// CANCEL BOOKING
export const cancelBooking = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const booking_id = req.params.booking_id || req.params.bookingId;
        const reason = req.body?.reason || "User cancelled before driver pickup";

        const booking = await Booking.findOne({ _id: booking_id, userId })
            .select("status isActive storeId payment pricing timeline cancelledAt cancelledBy cancelReason pickup.assignment.driverId delivery.assignment.driverId __v")
            .session(session);

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        if (!CANCELLABLE_STATUSES.includes(booking.status)) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.CANNOT_CANCEL(booking.status),
                STATUS_CODES.CONFLICT
            );
        }

        const now = new Date();
        booking.status = BOOKING_STATUS.CANCELLED;
        booking.isActive = false;
        booking.cancelledAt = now;
        booking.cancelledBy = "USER";
        booking.cancelReason = reason;

        booking.timeline.push(
            createTimelineEntry(
                BOOKING_STATUS.CANCELLED,
                `Cancelled by user: ${reason}`,
                userId,
                "User"
            )
        );

        await booking.save({ session });

        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session);
        }

        await session.commitTransaction();
        session.endSession();

        // Release driver if assigned
        const driverId = booking.pickup?.assignment?.driverId || booking.delivery?.assignment?.driverId;
        if (driverId) {
            await releaseDriver(driverId).catch((err) =>
                logger.warn("[cancelBooking] Failed to release driver:", err.message)
            );
        }

        // Cache bust job dispatch are post-commit best-effort
        await invalidateBookingCache(userId, booking_id).catch((err) =>
            logger.warn("[cancelBooking] Cache invalidation failed:", err.message)
        );

        // Log if job dispatch fails — don't let it swallow the response
        try {
            await queueBookingJob(
                JOB_QUEUES.BOOKING_CANCELLED,
                BOOKING_JOB_NAMES.BOOKING_CANCELLED,
                {
                    bookingId: booking_id,
                    userId,
                    reason,
                    cancelledBy: "USER",
                    type: "USER_CANCEL",
                }
            );
        } catch (jobErr) {
            logger.error(
                `[cancelBooking] Failed to queue cancellation job for booking ${booking_id}:`,
                jobErr.message
            );
        }

        // Emit socket event: booking cancelled (user-initiated)
        try {
            const io = (() => { try { return getIO(); } catch { return null; } })();
            if (io) {
                const { emitBookingCancelled } = await import("../../src/socket/emitters/booking.emitter.js");
                const assignedDriverId = booking.pickup?.assignment?.driverId?.toString() || booking.delivery?.assignment?.driverId?.toString() || null;
                emitBookingCancelled(io, booking_id, userId, booking.storeId ? booking.storeId.toString() : null, assignedDriverId, "USER", reason, booking.cancelledAt || new Date());
            }
        } catch (socketErr) {
            logger.debug(`[cancelBooking:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.BOOKING_CANCELLED,
            data: {
                bookingId: booking._id,
                status: booking.status,
                cancelledAt: booking.cancelledAt,
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[cancelBooking] Error:", err);
        return sendError(res, BOOKING_MESSAGES.CANCEL_FAILED);
    }
};

// GET ACTIVE BOOKINGS
export const getActiveBookings = async (req, res) => {
    try {
        const userId = req.user.auth_id;

        const cacheKey = BookingKeys.active(userId);
        const cached = await getCache(cacheKey);
        if (cached) {
            return sendResponse({ res, message: BOOKING_MESSAGES.ACTIVE_FETCHED, data: cached });
        }

        const bookings = await Booking.find({
            userId,
            status: { $in: ACTIVE_STATUSES },
        })
            .select(BOOKING_SELECT.LIST)
            .populate("pickup.assignment.driverId", "first_name last_name phone profile_picture vehicle_type")
            .populate("delivery.assignment.driverId", "first_name last_name phone profile_picture vehicle_type")
            .populate("storeId", "name phone coordinates address")
            .sort({ createdAt: -1 })
            .lean();

        const responseData = { bookings, total: bookings.length };

        await setCache(cacheKey, responseData, BookingTTL.ACTIVE);

        return sendResponse({ res, message: BOOKING_MESSAGES.ACTIVE_FETCHED, data: responseData });
    } catch (err) {
        logger.error("[getActiveBookings] Error:", err);
        return sendError(res, BOOKING_MESSAGES.ACTIVE_FETCH_FAILED);
    }
};

// GET BOOKING HISTORY
export const getBookingHistory = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        // Consistent with getMyBookings — use validated query
        const {
            page = 1,
            limit = 10,
            sort_order = "desc",
        } = req.validated?.query ?? req.query;

        const pageNum = Number(page);
        const limitNum = Math.min(Number(limit), BOOKING_LIMITS.MAX_PAGE_SIZE ?? 50);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        const cacheKey = BookingKeys.history(userId, pageNum, limitNum, sort_order);
        const cached = await getCache(cacheKey);
        if (cached) {
            return sendResponse({ res, message: BOOKING_MESSAGES.HISTORY_FETCHED, data: cached });
        }

        const filter = {
            userId,
            status: { $in: HISTORY_STATUSES },
        };

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                // Explicit select — avoid string concatenation bugs
                .select(
                    `${BOOKING_SELECT.LIST} cancelledAt cancelledBy cancelReason`
                        .split(" ")
                        .filter(Boolean)
                        .join(" ")
                )
                .sort({ createdAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const responseData = {
            bookings,
            pagination: buildPagination(pageNum, limitNum, total),
        };

        await setCache(cacheKey, responseData, BookingTTL.HISTORY);

        return sendResponse({ res, message: BOOKING_MESSAGES.HISTORY_FETCHED, data: responseData });
    } catch (err) {
        logger.error("[getBookingHistory] Error:", err);
        return sendError(res, BOOKING_MESSAGES.HISTORY_FETCH_FAILED);
    }
};

// REQUEST RETURN
export const requestReturn = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;
        const { returnLocation: deliveryLocation, notes } = req.body;

        if (!deliveryLocation?.lat || !deliveryLocation?.lng) {
            return sendError(res, "Valid delivery location is required", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            userId,
            status: { $in: [BOOKING_STATUS.STORED, BOOKING_STATUS.FINAL_PAYMENT_PENDING, BOOKING_STATUS.FINAL_PAYMENT_CAPTURED, BOOKING_STATUS.RETURN_REQUESTED] },
        });
        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        if ([BOOKING_STATUS.FINAL_PAYMENT_CAPTURED, BOOKING_STATUS.RETURN_REQUESTED].includes(booking.status)) {
            booking.deliveryLocation = deliveryLocation;
            if (!booking.delivery) booking.delivery = {};
            booking.delivery.notes = notes ?? "";
            booking.delivery.driverSearchStatus = "searching";
            booking.delivery.requestedAt = new Date();
            booking.timeline.push(
                createTimelineEntry(
                    booking.status,
                    "Return requested — payment already captured, searching for driver",
                    userId,
                    "User"
                )
            );
            await booking.save();

            await scheduleReturnProcessing(booking._id);

            return sendResponse({
                res,
                statusCode: STATUS_CODES.CREATED,
                message: "Payment already received — searching for a return driver",
                data: { bookingId: booking._id, requiresPayment: false },
            });
        }

        let rule = null;
        if (booking.pricing?.pricingRuleId) {
            rule = await PricingRule.findById(booking.pricing.pricingRuleId);
        }
        if (!rule) {
            rule = await PricingRule.getActiveRule(booking.serviceAreaId);
        }
        if (!rule) {
            return sendError(res, "Pricing rule not found for service area", STATUS_CODES.BAD_REQUEST);
        }

        const storeCoords = {
            lat: booking.storageLocation.lat,
            lng: booking.storageLocation.lng,
        };

        const startedAt = booking.storage?.startedAt || booking.storage?.storedAt || booking.createdAt;
        const snapshot = booking.pricing?.pricingSnapshot || PricingService.buildPricingSnapshot(rule, storeCoords);

        const returnQuote = PricingService.calculateReturnQuote(
            snapshot,
            storeCoords,
            deliveryLocation,
            startedAt,
            new Date()
        );

        const balanceAmountMajor = Money.fromMinor(returnQuote.totalAmountMinor);

        if (returnQuote.totalAmountMinor <= 0) {
            booking.deliveryLocation = deliveryLocation;
            if (!booking.delivery) booking.delivery = {};
            booking.delivery.notes = notes ?? "";
            booking.delivery.driverSearchStatus = "searching";
            booking.delivery.requestedAt = new Date();
            booking.pricing.storageHours = returnQuote.billableHours;
            booking.pricing.distanceCharge = Money.fromMinor(returnQuote.returnDeliveryFeeMinor);
            booking.pricing.balanceAmount = 0;
            booking.status = BOOKING_STATUS.RETURN_REQUESTED;
            booking.timeline.push(createTimelineEntry(BOOKING_STATUS.RETURN_REQUESTED, "Return requested (No extra charge)", userId, "User"));
            await booking.save();

            await scheduleReturnProcessing(booking._id);
            invalidateBookingCache(userId, booking_id).catch(err =>
                logger.warn("[requestReturn] Cache invalidation failed:", err.message)
            );

            return sendResponse({
                res,
                statusCode: STATUS_CODES.CREATED,
                message: "Return requested successfully",
                data: { requiresPayment: false }
            });
        }

        const order = await razorpay.orders.create({
            amount: returnQuote.totalAmountMinor, // paise integer
            currency: "INR",
            receipt: `${booking.bookingCode}-FINAL`,
            notes: { bookingId: booking._id.toString(), type: PAYMENT_TYPE.FINAL },
        });

        const payment = await Payment.create({
            bookingId: booking._id,
            userId,
            type: PAYMENT_TYPE.FINAL,
            razorpayOrderId: order.id,
            amountMinor: order.amount,
            amount: Money.fromMinor(order.amount),
            currency: order.currency,
            status: PAYMENT_STATUS.CREATED,
        });

        booking.deliveryLocation = deliveryLocation;
        booking.delivery.notes = notes ?? "";
        booking.pricing.storageHours = returnQuote.billableHours;
        booking.pricing.distanceCharge = Money.fromMinor(returnQuote.returnDeliveryFeeMinor);
        booking.pricing.balanceAmount = balanceAmountMajor;
        if (booking.pricing.pricingSnapshot) {
            booking.pricing.pricingSnapshot.returnDistanceKm = returnQuote.returnDistanceKm;
            booking.pricing.pricingSnapshot.returnCustomerRateMinor = snapshot.perKmRateMinor;
            booking.pricing.pricingSnapshot.returnCustomerAmountMinor = returnQuote.returnDeliveryFeeMinor;
        }
        booking.status = BOOKING_STATUS.FINAL_PAYMENT_PENDING;
        booking.timeline.push(createTimelineEntry(BOOKING_STATUS.FINAL_PAYMENT_PENDING, "Final payment required", userId, "User"));
        await booking.save();

        // Cache invalidation
        invalidateBookingCache(userId, booking_id).catch(err =>
            logger.warn("[requestReturn] Cache invalidation failed:", err.message)
        );

        // Socket event: return requested
        try {
            const io = (() => { try { return getIO(); } catch { return null; } })();
            if (io) {
                emitBookingReturnRequested(
                    io,
                    booking_id,
                    userId,
                    booking.storeId ? booking.storeId.toString() : null,
                    booking.deliveryLocation,
                    null
                );
            }
        } catch (socketErr) {
            logger.debug(`[requestReturn:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Final payment required",
            data: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: booking.status,
                requiresPayment: true,
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            },
        });
    } catch (err) {
        logger.error("[requestReturn] Failed:", err);
        return sendError(res, "Failed to process return request");
    }
};

// GET ASSIGNED DRIVER
export const getAssignDriver = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        // Lean read — no mutation needed
        const booking = await findUserBooking(
            booking_id,
            userId,
            BOOKING_SELECT.ASSIGN_DRIVER
        );

        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        const deliveryDriverId = booking.delivery?.assignment?.driverId;
        const pickupDriverId = booking.pickup?.assignment?.driverId;
        const driverId = deliveryDriverId ?? pickupDriverId;

        if (!driverId) {
            return sendError(res, BOOKING_MESSAGES.DRIVER_NOT_ASSIGNED, STATUS_CODES.NOT_FOUND);
        }

        const driver = await findDriver(
            driverId,
            "first_name last_name phone vehicle_type vehicle_details"
        );

        if (!driver) {
            return sendError(res, DRIVER_MESSAGES.DRIVER_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        const assignment = deliveryDriverId
            ? booking.delivery.assignment
            : booking.pickup.assignment;

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.ASSIGN_DRIVER,
            data: {
                bookingId: booking._id,
                status: booking.status,
                driver: {
                    driverId: driver._id,
                    name: `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim(),
                    phone: driver.phone,
                    vehicleType: driver.vehicle_type,
                    vehicleNumber: driver.vehicle_details?.registration_number ?? null,
                },
                assignedAt: assignment?.assignedAt ?? null,
                acceptedAt: assignment?.acceptedAt ?? null,
                completedAt: assignment?.completedAt ?? null,
            },
        });
    } catch (err) {
        logger.error("[getAssignDriver] Error:", err);
        return sendError(res, BOOKING_MESSAGES.ASSIGN_DRIVER_FAILED);
    }
};

// GET ASSIGNED STORE
export const getAssignStore = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        // Lean read no mutation
        const booking = await findUserBooking(
            booking_id,
            userId,
            BOOKING_SELECT.ASSIGN_STORE
        );

        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        if (!booking.storeId) {
            return sendError(res, BOOKING_MESSAGES.STORE_NOT_ASSIGNED, STATUS_CODES.NOT_FOUND);
        }

        const store = await findStore(
            booking.storeId,
            "store_name store_contact_number location"
        );

        if (!store) {
            return sendError(res, STORE_MESSAGES.STORE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.ASSIGN_STORE_DETAILS,
            data: {
                bookingId: booking._id,
                status: booking.status,
                store: {
                    storeId: store._id,
                    name: store.store_name,
                    phone: store.store_contact_number,
                    address: store.location,
                },
            },
        });
    } catch (err) {
        logger.error("[getAssignStore] Error:", err);
        return sendError(res, BOOKING_MESSAGES.GET_ASSIGN_STORE_FAILED);
    }
};

// GET USER CUSTOMER INVOICE
export const getUserInvoice = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await Booking.findOne({ _id: booking_id, userId }).select("_id").lean();
        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        const { getCustomerInvoiceData } = await import("../../services/invoiceService.js");
        const invoice = await getCustomerInvoiceData(booking_id);

        return sendResponse({
            res,
            message: "Customer invoice fetched successfully",
            data: { invoice },
        });
    } catch (err) {
        logger.error("[getUserInvoice] Error:", err);
        return sendError(res, "Failed to fetch customer invoice");
    }
};

// ESTIMATE BOOKING PRICE & BILL BREAKDOWN
export const estimateBookingPrice = async (req, res) => {
    try {
        const {
            pickupLocation,
            luggage = { small: 0, medium: 0, large: 0, other: 0 },
            storageHours = 4,
            tipAmount = 0,
            couponCode = "",
        } = req.body;

        if (!pickupLocation || typeof pickupLocation.lat !== "number" || typeof pickupLocation.lng !== "number") {
            return sendError(res, "Valid pickup coordinates (lat, lng) are required for price estimation.", STATUS_CODES.BAD_REQUEST);
        }

        const totalCount = calculateTotalLuggage(luggage);
        if (totalCount === 0) {
            return sendError(res, "At least one luggage item is required.", STATUS_CODES.BAD_REQUEST);
        }

        // 1. Serviceability check
        const serviceabilityResult = await checkServiceability(pickupLocation.lng, pickupLocation.lat);
        if (!serviceabilityResult.isServiceable) {
            return sendError(res, BOOKING_MESSAGES.NOT_SERVICEABLE, STATUS_CODES.FORBIDDEN);
        }
        const { serviceAreaId } = serviceabilityResult;

        // 2. Nearest store lookup
        const { store: nearestStore } = await findNearestAvailableStore(pickupLocation.lat, pickupLocation.lng);
        if (!nearestStore) {
            return sendError(res, BOOKING_MESSAGES.NO_STORE_AVAILABLE, STATUS_CODES.NOT_FOUND);
        }

        const targetServiceArea = serviceAreaId ?? nearestStore.service_area_id;
        const rule = await PricingRule.getActiveRule(targetServiceArea);
        if (!rule) {
            return sendError(res, "No active pricing rule found for this service area.", STATUS_CODES.CONFLICT);
        }

        const storeCoords = {
            lat: nearestStore.location.coordinates[1],
            lng: nearestStore.location.coordinates[0],
        };

        const pricingSnapshot = PricingService.buildPricingSnapshot(rule, storeCoords);
        const advanceQuote = PricingService.calculateAdvanceQuote(pricingSnapshot, pickupLocation, storeCoords, luggage);

        // 3. Estimated Storage Calculation (for estimated hours)
        const estHours = Math.max(1, Number(storageHours) || 4);
        const now = new Date();
        const futureDate = new Date(now.getTime() + estHours * 3600000);
        const storageCharge = PricingService.calculateStorageCharge(pricingSnapshot, now, futureDate, luggage);

        // 4. Breakdown values in Major units (INR)
        const advancePlatformFee = Money.fromMinor(advanceQuote.breakdownMinor.platformFeeMinor);
        const advanceDeliveryFee = Money.fromMinor(advanceQuote.breakdownMinor.deliveryFeeMinor);
        const advanceHandlingFee = Money.fromMinor(advanceQuote.breakdownMinor.handlingFeeMinor);
        const advancePackingFee = Money.fromMinor(advanceQuote.breakdownMinor.packingFeeMinor);
        const advanceBagItems = Money.fromMinor(advanceQuote.breakdownMinor.bagItemsMinor || 0);
        const advanceSubtotal = Money.fromMinor(advanceQuote.subtotalMinor);
        const advanceTax = Money.fromMinor(advanceQuote.taxAmountMinor);
        const advanceTotal = Money.fromMinor(advanceQuote.totalAmountMinor);

        // Itemized Bag Breakdown
        const bp = rule.bagPricing || {
            small: { basePrice: 49, hourlyRate: 15 },
            medium: { basePrice: 99, hourlyRate: 25 },
            large: { basePrice: 149, hourlyRate: 40 },
            other: { basePrice: 199, hourlyRate: 50 },
        };

        const bagBreakdown = [
            { id: "small", name: "Small Bag", count: luggage.small || 0, unitPrice: bp.small?.basePrice ?? 49, hourlyRate: bp.small?.hourlyRate ?? 15, total: (luggage.small || 0) * (bp.small?.basePrice ?? 49) },
            { id: "medium", name: "Medium Bag", count: luggage.medium || 0, unitPrice: bp.medium?.basePrice ?? 99, hourlyRate: bp.medium?.hourlyRate ?? 25, total: (luggage.medium || 0) * (bp.medium?.basePrice ?? 99) },
            { id: "large", name: "Large Bag", count: luggage.large || 0, unitPrice: bp.large?.basePrice ?? 149, hourlyRate: bp.large?.hourlyRate ?? 40, total: (luggage.large || 0) * (bp.large?.basePrice ?? 149) },
            { id: "other", name: "Odd Size / Special", count: luggage.other || 0, unitPrice: bp.other?.basePrice ?? 199, hourlyRate: bp.other?.hourlyRate ?? 50, total: (luggage.other || 0) * (bp.other?.basePrice ?? 199) },
        ];

        // Storage & Final Payment Breakdown
        const hourlyStorageRate = Money.fromMinor(storageCharge.customerStorageFeeMinor) / estHours || rule.hourlyStorageRate || 25;
        const estimatedStorageFee = Money.fromMinor(storageCharge.customerStorageFeeMinor);
        const estimatedReturnDeliveryFee = advanceDeliveryFee;
        const finalSubtotal = estimatedStorageFee + estimatedReturnDeliveryFee;
        const finalTax = +(finalSubtotal * ((pricingSnapshot.taxRate || 18) / 100)).toFixed(2);
        const finalTotal = +(finalSubtotal + finalTax).toFixed(2);

        // Coupon calculation
        let discount = 0;
        const normalizedCoupon = couponCode ? couponCode.trim().toUpperCase() : "";
        if (normalizedCoupon === "WELCOME50" || normalizedCoupon === "HOLDIT50" || normalizedCoupon === "AMZPAY50") {
            discount = Math.min(advanceTotal, 50);
        } else if (normalizedCoupon === "WELCOME20") {
            discount = Math.min(50, +(advanceTotal * 0.2).toFixed(2));
        } else if (normalizedCoupon === "HOLDIT10") {
            discount = Math.min(100, +(advanceTotal * 0.1).toFixed(2));
        } else if (normalizedCoupon === "FREEBIE") {
            discount = Math.min(advanceTotal, 25);
        }

        const payableAdvance = Math.max(0, +(advanceTotal + (Number(tipAmount) || 0) - discount).toFixed(2));
        const estimatedGrandTotal = +(payableAdvance + finalTotal).toFixed(2);

        return sendResponse({
            res,
            message: "Price estimation calculated successfully",
            data: {
                currency: rule.currency || "INR",
                serviceAreaId: targetServiceArea,
                nearestStore: {
                    id: nearestStore._id,
                    name: nearestStore.store_name || nearestStore.name || "Partner Storage Hub",
                    distanceKm: advanceQuote.distanceKm,
                },
                pricingRule: {
                    id: rule._id,
                    perKmRate: rule.perKmRate,
                    hourlyStorageRate: rule.hourlyStorageRate,
                    maxDailyRate: rule.maxDailyRate || null,
                    taxRate: pricingSnapshot.taxRate,
                    bagPricing: bp,
                },
                advancePayment: {
                    platformFee: advancePlatformFee,
                    deliveryFee: advanceDeliveryFee,
                    handlingFee: advanceHandlingFee,
                    packingFee: advancePackingFee,
                    bagItemsTotal: advanceBagItems,
                    bagBreakdown,
                    subtotal: advanceSubtotal,
                    taxAmount: advanceTax,
                    totalAdvance: advanceTotal,
                    tipAmount: Number(tipAmount) || 0,
                    discountAmount: discount,
                    payableNow: payableAdvance,
                },
                storageEstimate: {
                    hourlyRate: +hourlyStorageRate.toFixed(2),
                    estimatedHours: estHours,
                    estimatedStorageFee: estimatedStorageFee,
                    maxDailyRate: rule.maxDailyRate || null,
                },
                finalPaymentEstimate: {
                    estimatedStorageFee: estimatedStorageFee,
                    estimatedReturnDeliveryFee: estimatedReturnDeliveryFee,
                    estimatedTax: finalTax,
                    estimatedFinalTotal: finalTotal,
                },
                estimatedGrandTotal,
                luggageSummary: {
                    ...luggage,
                    totalCount,
                },
            },
        });
    } catch (err) {
        logger.error("[estimateBookingPrice] Error:", err);
        return sendError(res, err.message || "Failed to calculate price estimation", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};

// GET ACTIVE PRICING RULE FOR USER LOCATION / SERVICE AREA
export const getActivePricingRule = async (req, res) => {
    try {
        const { lat, lng, serviceAreaId } = req.query;

        let targetServiceArea = serviceAreaId;

        if (!targetServiceArea && lat && lng) {
            const latitude = Number(lat);
            const longitude = Number(lng);
            if (!isNaN(latitude) && !isNaN(longitude)) {
                const serviceability = await checkServiceability(longitude, latitude);
                if (serviceability?.isServiceable) {
                    targetServiceArea = serviceability.serviceAreaId;
                } else {
                    const { store } = await findNearestAvailableStore(latitude, longitude);
                    if (store) {
                        targetServiceArea = store.service_area_id;
                    }
                }
            }
        }

        let rule;
        if (targetServiceArea) {
            rule = await PricingRule.getActiveRule(targetServiceArea);
        }

        if (!rule) {
            rule = await PricingRule.findOne({ active: true }).sort({ createdAt: -1 });
        }

        const bagPricing = rule?.bagPricing || {
            small: { basePrice: 49, hourlyRate: 15 },
            medium: { basePrice: 99, hourlyRate: 25 },
            large: { basePrice: 149, hourlyRate: 40 },
            other: { basePrice: 199, hourlyRate: 50 },
        };

        return sendResponse({
            res,
            message: "Active pricing rule fetched successfully",
            data: {
                pricingRule: {
                    id: rule?._id || null,
                    name: rule?.name || "Standard Pricing",
                    serviceAreaId: rule?.serviceAreaId || null,
                    perKmRate: rule?.perKmRate || 12,
                    hourlyStorageRate: rule?.hourlyStorageRate || 25,
                    maxDailyRate: rule?.maxDailyRate || null,
                    feeBreakdown: rule?.feeBreakdown || {
                        platformFee: 10,
                        handlingFee: 0,
                        packingFee: 0,
                    },
                    bagPricing,
                    currency: rule?.currency || "INR",
                },
            },
        });
    } catch (err) {
        logger.error("[getActivePricingRule] Error:", err);
        return sendError(res, "Failed to fetch active pricing rule");
    }
};