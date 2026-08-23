import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import { markDriverOnTrip, markDriverAvailable, addDriverToRedis } from "../../services/driverGeoService.js";
import { BOOKING_STATUS, OTP_MAX_ATTEMPTS } from "../../utils/constants.js";
import { generateOTP } from "../../utils/otp.js";
import {
    DRIVER_VISIBLE_STATUSES,
    DRIVER_HISTORY_STATUSES,
} from "../../constants/driver/driver.ride.js";
import {
    clearOffer,
    markOfferAccepted,
    cleanupBookingRedisKeys,
    markDriverTried,
    scheduleOfferNextDriver,
    getOfferStatus,
    scheduleDriverSearch,
} from "../user/driverAssignHelper.js";
import { invalidateBookingCache } from "../user/bookingHelper.js";
import logger from "../../utils/logger.js";
import { DriverKeys } from "../../constants/redis/driver.keys.js";
import { BookingKeys } from "../../constants/redis/booking.keys.js";
import { deleteCache, deleteByPattern, getCache } from "../../constants/redis/redisOperation.js";
import { AuthKeys } from "../../constants/redis/auth.keys.js";
import { invalidateDriverCache } from "../../constants/redis/invalidate/driver.invalidate.js";
import redis from "../../services/redisService.js";

// Statuses where a booking is still awaiting/searching for a RETURN driver.
// Used to correctly classify rejections during the return-search phase —
// a booking can be sitting at either of these two statuses depending on
// whether it went through the zero-balance path (RETURN_REQUESTED) or the
// pay-first path (FINAL_PAYMENT_CAPTURED) before search started.
const RETURN_AWAITING_STATUSES = [BOOKING_STATUS.RETURN_REQUESTED, BOOKING_STATUS.FINAL_PAYMENT_CAPTURED];

// QUERIES
export const getAssignedRides = async (driverId, selectFields) => {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    return Booking.find({
        $or: [
            { "pickup.assignment.driverId": driverObjectId },
            { "delivery.assignment.driverId": driverObjectId },
        ],
        status: { $in: DRIVER_VISIBLE_STATUSES },
        isActive: true,
    })
        .select(selectFields)
        .sort({ "pickup.scheduledAt": 1 })
        .populate("userId", "first_name last_name phone")
        .lean();
};

export const getDriverActiveRide = async (driverId, selectFields) => {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    const rawBooking = await Booking.findOne({
        $or: [
            { "pickup.assignment.driverId": driverObjectId },
            { "delivery.assignment.driverId": driverObjectId },
        ],
        status: {
            $in: [
                BOOKING_STATUS.DRIVER_ASSIGNED,
                BOOKING_STATUS.DRIVER_ARRIVED,
                BOOKING_STATUS.PICKED_UP,
                BOOKING_STATUS.AT_STORE,
                BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                BOOKING_STATUS.OUT_FOR_RETURN,
                BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
            ],
        },
        isActive: true,
    })
        .select(selectFields)
        .populate("userId", "first_name last_name phone")
        .populate("storeId", "store_name store_contact_number location")
        .lean();

    if (!rawBooking) return null;

    const isPickupLeg = [
        BOOKING_STATUS.DRIVER_ASSIGNED,
        BOOKING_STATUS.DRIVER_ARRIVED,
        BOOKING_STATUS.PICKED_UP,
        BOOKING_STATUS.AT_STORE,
    ].includes(rawBooking.status);

    const rideType = isPickupLeg ? "PICKUP" : "RETURN";
    const direction = isPickupLeg ? "USER → STORAGE" : "STORAGE → USER";
    const pickupLoc = isPickupLeg ? rawBooking.pickupLocation : (rawBooking.storageLocation || rawBooking.storeId?.location);
    const dropoffLoc = isPickupLeg ? (rawBooking.storageLocation || rawBooking.storeId?.location) : rawBooking.deliveryLocation;
    const fee = isPickupLeg
        ? (rawBooking.pricing?.advanceBreakdown?.deliveryFee ?? 0)
        : (rawBooking.pricing?.distanceCharge ?? 0);
    const fare = fee + (rawBooking.tipAmount || 0);

    return {
        ...rawBooking,
        rideId: `${rawBooking._id}:${isPickupLeg ? "pickup" : "return"}`,
        rideType,
        direction,
        pickupLocation: pickupLoc,
        deliveryLocation: dropoffLoc,
        dropoffLocation: dropoffLoc,
        fare,
        driverEarnings: fare,
    };
};

export const findDriverRide = async (bookingId, driverId, selectFields = "") => {
    let cleanBookingId = bookingId;
    if (bookingId.includes(":")) {
        cleanBookingId = bookingId.split(":")[0];
    }

    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    return Booking.findOne({
        _id: cleanBookingId,
        $or: [
            { "pickup.assignment.driverId": driverObjectId },
            { "delivery.assignment.driverId": driverObjectId },
        ],
    })
        .select(selectFields)
        .lean();
};

export const getDriverRideHistory = async (driverId, skip, limit, sortDir) => {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    const filter = {
        $or: [
            { "pickup.assignment.driverId": driverObjectId },
            { "delivery.assignment.driverId": driverObjectId },
        ],
        status: { $in: DRIVER_HISTORY_STATUSES },
    };

    const [rawRides, total] = await Promise.all([
        Booking.find(filter)
            .select("bookingCode status pickupLocation storageLocation deliveryLocation luggage pricing tipAmount pickup delivery createdAt updatedAt cancelledAt cancelReason storeId")
            .populate("storeId", "store_name location")
            .sort({ createdAt: sortDir })
            .skip(skip)
            .limit(limit)
            .lean(),
        Booking.countDocuments(filter),
    ]);

    const rides = [];

    for (const b of rawRides) {
        const isPickup = b.pickup?.assignment?.driverId?.toString() === driverId.toString();
        const isDelivery = b.delivery?.assignment?.driverId?.toString() === driverId.toString();

        // 1. Pickup Ride Leg entry
        if (isPickup) {
            const pickupFee = (b.pricing?.advanceBreakdown?.deliveryFee ?? 0) + (b.tipAmount || 0);
            rides.push({
                _id: `${b._id}:pickup`,
                rideId: `${b._id}:pickup`,
                bookingId: b._id,
                bookingCode: b.bookingCode,
                rideType: "PICKUP",
                direction: "USER → STORAGE",
                pickupLocation: b.pickupLocation,
                deliveryLocation: b.storageLocation || b.storeId?.location,
                storeDetails: {
                    name: b.storeId?.store_name || "Storage Partner",
                    address: b.storageLocation?.address || b.storeId?.location?.address || "Store Vault Location",
                },
                fare: pickupFee,
                driverEarnings: pickupFee,
                pricing: {
                    ...b.pricing,
                    fare: pickupFee,
                    total: pickupFee,
                },
                status: b.pickup?.assignment?.completedAt ? "delivered" : b.status,
                completedAt: b.pickup?.assignment?.completedAt || b.createdAt,
                statementId: `DSP-${(b.bookingCode || b._id.toString()).slice(-8).toUpperCase()}-PICKUP`,
                luggage: b.luggage,
            });
        }

        // 2. Return Delivery Ride Leg entry
        if (isDelivery && b.status === BOOKING_STATUS.DELIVERED) {
            const returnFee = (b.pricing?.distanceCharge ?? 0) + (b.tipAmount || 0);
            rides.push({
                _id: `${b._id}:return`,
                rideId: `${b._id}:return`,
                bookingId: b._id,
                bookingCode: b.bookingCode,
                rideType: "RETURN",
                direction: "STORAGE → USER",
                pickupLocation: b.storageLocation || b.storeId?.location,
                deliveryLocation: b.deliveryLocation,
                storeDetails: {
                    name: b.storeId?.store_name || "Storage Partner",
                    address: b.storageLocation?.address || b.storeId?.location?.address || "Store Vault Location",
                },
                fare: returnFee,
                driverEarnings: returnFee,
                pricing: {
                    ...b.pricing,
                    fare: returnFee,
                    total: returnFee,
                },
                status: "delivered",
                completedAt: b.delivery?.assignment?.completedAt || b.updatedAt,
                statementId: `DSP-${(b.bookingCode || b._id.toString()).slice(-8).toUpperCase()}-RETURN`,
                luggage: b.luggage,
            });
        }
    }

    return { rides, total: rides.length > total ? rides.length : total };
};

// ACCEPT
export const processRideAccept = async (bookingId, driverId) => {
    const now = new Date();
    const objDriverId = new mongoose.Types.ObjectId(driverId);

    let booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.STORE_ASSIGNED,
            "pickup.assignment.driverId": { $exists: false },
        },
        {
            $set: {
                status: BOOKING_STATUS.DRIVER_ASSIGNED,
                lastStatusUpdatedAt: now,
                "pickup.assignment": {
                    driverId: objDriverId,
                    assignedAt: now,
                    acceptedAt: now,
                },
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.DRIVER_ASSIGNED,
                    note: "Driver accepted the ride",
                    updatedBy: objDriverId,
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (!booking) {
        booking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                status: { $in: [BOOKING_STATUS.FINAL_PAYMENT_CAPTURED, BOOKING_STATUS.RETURN_REQUESTED] },
                "delivery.assignment.driverId": { $exists: false },
            },
            {
                $set: {
                    status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                    lastStatusUpdatedAt: now,
                    "delivery.assignment": {
                        driverId: objDriverId,
                        assignedAt: now,
                        acceptedAt: now,
                    },
                },
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                        note: "Return driver accepted the ride",
                        updatedBy: objDriverId,
                        updatedByModel: "Driver",
                        createdAt: now,
                    },
                },
            },
            { returnDocument: "after" }
        );
    }

    if (!booking) return { success: false, booking: null };

    await Promise.all([
        markDriverOnTrip(driverId, bookingId),
        Driver.findByIdAndUpdate(driverId, {
            $set: { is_on_trip: true, current_booking_id: bookingId },
        }),
    ]);

    await markOfferAccepted(bookingId);
    await cleanupBookingRedisKeys(bookingId, driverId);

    return { success: true, booking };
};

export const processRideReject = async (bookingId, driverId) => {
    // Read attemptNumber before clearing so we can schedule the next offer correctly
    const { exists, offer } = await getOfferStatus(bookingId);
    const attemptNumber = exists ? parseInt(offer.attemptNumber ?? "1", 10) : 1;

    await clearOffer(bookingId, driverId);
    await markDriverTried(bookingId, driverId);

    // Schedule offer to next candidate using the real attempt counter
    const booking = await Booking.findById(bookingId).select("status").lean();

    // FIXED: was only checking `status === RETURN_REQUESTED`. A booking can also
    // be mid return-search while sitting at FINAL_PAYMENT_CAPTURED (the pay-first
    // path) — that case was falling through to "PICKUP", which on final exhaustion
    // would route to autoCancelBooking instead of handleReturnDriverNotFound, so a
    // paid return would never get reverted back to STORED correctly.
    const type = RETURN_AWAITING_STATUSES.includes(booking?.status) ? "RETURN" : "PICKUP";
    await scheduleOfferNextDriver(bookingId, type, attemptNumber + 1);
};

// ARRIVE AT PICKUP LOCATION
export const processArriveAtPickup = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.DRIVER_ASSIGNED,
            "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
        },
        {
            $set: {
                status: BOOKING_STATUS.DRIVER_ARRIVED,
                lastStatusUpdatedAt: now,
                "pickup.assignment.startedAt": now,
                "pickup.assignment.otp": generateOTP(), // User -> Driver
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.DRIVER_ARRIVED,
                    note: "Driver arrived at pickup location",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );
};

// COMPLETE PICKUP luggage collected, heading to store
export const processCompletePickup = async (bookingId, driverId, otp, photos = []) => {
    const now = new Date();

    const booking = await Booking.findOne({
        _id: bookingId,
        status: BOOKING_STATUS.DRIVER_ARRIVED,
        "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
    }).select("pickup.assignment.otp");

    if (!booking) return null;

    // OTP Rate limiting check
    const otpRateLimitKey = AuthKeys.otpRate("driver", driverId, bookingId);
    const failedAttempts = await getCache(otpRateLimitKey);
    if (failedAttempts >= OTP_MAX_ATTEMPTS) {
        throw new Error("Too many failed attempts. Locked out for 15 minutes.");
    }

    // OTP Verification
    if (booking.pickup.assignment.otp !== otp) {
        // FIXED: was `rateLimitKey`, which was never declared in this function —
        // threw ReferenceError on every wrong-OTP attempt instead of rate-limiting it.
        const fails = await redis.incr(otpRateLimitKey);
        if (fails === 1) await redis.expire(otpRateLimitKey, 15 * 60);
        throw new Error("Invalid pickup OTP");
    }

    await deleteCache(otpRateLimitKey); // clear on success

    return Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: {
                status: BOOKING_STATUS.PICKED_UP,
                lastStatusUpdatedAt: now,
                "pickup.assignment.completedAt": now,
                "luggagePhotos.pickup": photos,
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.PICKED_UP,
                    note: "Luggage picked up from user",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );
};

export const processCompletePickupAtStore = async (bookingId, driverId, otp, photos = []) => {
    const now = new Date();

    const booking = await Booking.findOne({
        _id: bookingId,
        status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
        "delivery.assignment.driverId": new mongoose.Types.ObjectId(driverId),
    });

    if (!booking) return null;

    // OTP Rate limiting check
    const rateLimitKey = AuthKeys.otpRate("driver", driverId, bookingId);
    const failedAttempts = await getCache(rateLimitKey);
    if (failedAttempts >= 5) {
        throw new Error("Too many failed attempts. Locked out for 15 minutes.");
    }

    // OTP Verification
    if (booking.delivery.assignment.storageReturnOtp !== otp) {
        const fails = await redis.incr(rateLimitKey);
        if (fails === 1) await redis.expire(rateLimitKey, 15 * 60);
        throw new Error("Invalid pickup OTP");
    }

    await deleteCache(rateLimitKey); // clear on success

    const updated = await Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: {
                status: BOOKING_STATUS.OUT_FOR_RETURN,
                lastStatusUpdatedAt: now,
                "storage.releasedAt": now,
                "luggagePhotos.delivery": photos,
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.OUT_FOR_RETURN,
                    note: "Luggage handed over to return driver by store",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (updated) {
        invalidateBookingCache(updated, { storeId: updated.storeId, driverIds: [driverId] }).catch((err) =>
            logger.error(`[processCompletePickupAtStore] Cache invalidation failed for ${bookingId}:`, err)
        );

        import("../../services/fundDistributionService.js")
            .then(({ updateEarningStatus }) => updateEarningStatus(bookingId, "STORAGE", "PAYABLE"))
            .catch((err) => logger.error(`[processCompletePickupAtStore] Store earning update failed for ${bookingId}:`, err));
    }

    return updated;
};

// ARRIVE AT STORE driver reached the store with luggage
export const processArriveAtStore = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.PICKED_UP,
            "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
        },
        {
            $set: {
                status: BOOKING_STATUS.AT_STORE,
                lastStatusUpdatedAt: now,
                "pickup.assignment.storageOtp": generateOTP(), // Store -> Driver
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.AT_STORE,
                    note: "Driver arrived at store with luggage",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );
};

export const processArriveAtStoreForReturn = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
            "delivery.assignment.driverId": new mongoose.Types.ObjectId(driverId),
        },
        {
            $set: { "delivery.assignment.storageReturnOtp": generateOTP() },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                    note: "Driver arrived at store to pickup return luggage",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );
};

// ARRIVE AT USER FOR RETURN Delivery
export const processArriveAtUserReturn = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.OUT_FOR_RETURN,
            "delivery.assignment.driverId": new mongoose.Types.ObjectId(driverId),
        },
        {
            $set: {
                status: BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
                lastStatusUpdatedAt: now,
                "delivery.assignment.startedAt": now,
                "delivery.assignment.returnOtp": generateOTP(), // User -> Driver
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
                    note: "Driver arrived at delivery location",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );
};

// CANCEL RIDE
// Statuses where cancellation is safe to re-search
// CANCEL RIDE
// Statuses where cancellation is safe to re-search automatically
const PICKUP_RESEARCHABLE_STATUSES = [
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED,
];

const DELIVERY_RESEARCHABLE_STATUSES = [
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
];

const RESEARCHABLE_STATUSES = [
    ...PICKUP_RESEARCHABLE_STATUSES,
    ...DELIVERY_RESEARCHABLE_STATUSES,
];

// Statuses where luggage is in custody/transit — driver direct cancel BLOCKED, requires admin/support review
const PICKUP_CRITICAL_STATUSES = [
    BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.AT_STORE,
];

const DELIVERY_CRITICAL_STATUSES = [
    BOOKING_STATUS.OUT_FOR_RETURN,
    BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
];

const CRITICAL_STATUSES = [
    ...PICKUP_CRITICAL_STATUSES,
    ...DELIVERY_CRITICAL_STATUSES,
];

export const processDriverCancelRide = async (bookingId, driverId, reason = "") => {
    const now = new Date();
    const objDriverId = new mongoose.Types.ObjectId(driverId);

    const booking = await Booking.findOne({
        _id: bookingId,
        $or: [
            { "pickup.assignment.driverId": objDriverId },
            { "delivery.assignment.driverId": objDriverId },
        ],
    }).select("status userId storeId pickup.assignment delivery.assignment").lean();

    if (!booking) {
        return { success: false, reason: "RIDE_NOT_FOUND" };
    }

    const isPickupDriver = booking.pickup?.assignment?.driverId?.toString() === driverId.toString();
    const isDeliveryDriver = booking.delivery?.assignment?.driverId?.toString() === driverId.toString();
    const leg = isPickupDriver ? "PICKUP" : (isDeliveryDriver ? "DELIVERY" : null);

    if (!leg) {
        return { success: false, reason: "RIDE_NOT_FOUND" };
    }

    const { status } = booking;
    const researchableStatuses = leg === "PICKUP" ? PICKUP_RESEARCHABLE_STATUSES : DELIVERY_RESEARCHABLE_STATUSES;
    const criticalStatuses = leg === "PICKUP" ? PICKUP_CRITICAL_STATUSES : DELIVERY_CRITICAL_STATUSES;

    const isCritical = criticalStatuses.includes(status);
    const isResearchable = researchableStatuses.includes(status);

    if (!isCritical && !isResearchable) {
        return { success: false, reason: "CANNOT_CANCEL_IN_STATUS" };
    }

    // RULE: Drivers CANNOT directly cancel an accepted ride.
    // They must raise a Critical Support Request so the Support / Admin team can review and process.
    try {
        const SupportTicket = (await import("../../models/SupportTicket.js")).default;
        const { REQUESTER_MODEL, TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS, CHAT_TYPE } = await import("../../utils/constants.js");

        let ticket = await SupportTicket.findOne({
            bookingId,
            requesterId: objDriverId,
            requesterModel: REQUESTER_MODEL.DRIVER,
            status: { $in: [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.PENDING] },
        });

        if (!ticket) {
            const ticketCode = `TK-CRIT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            ticket = await SupportTicket.create({
                ticketCode,
                requesterId: objDriverId,
                requesterModel: REQUESTER_MODEL.DRIVER,
                userId: booking.userId,
                bookingId,
                chatType: CHAT_TYPE.TICKET,
                subject: `Critical Ride Cancellation Request (${leg}): ${reason || "Driver requested ride cancellation"}`,
                category: TICKET_CATEGORY.DRIVER,
                priority: TICKET_PRIORITY.URGENT,
                status: TICKET_STATUS.OPEN,
                isEscalatedToLive: true,
                messages: [
                    {
                        senderId: objDriverId,
                        senderModel: "Driver",
                        message: `Driver requested ride cancellation for booking #${(booking.bookingCode || bookingId).slice(-6)} during status '${status}' (${leg}). Reason: ${reason || "No reason specified"}. Direct driver cancellation is disabled. Support team must review and process ride cancellation with critical status.`,
                    },
                ],
            });
        }

        await flagCriticalCancellation(bookingId, driverId, status, reason, leg);

        return {
            success: false,
            reason: "CRITICAL_CANCEL_REQUIRES_SUPPORT",
            message: `Direct cancellation is disabled for active rides. A critical cancellation request (${ticket.ticketCode}) has been dispatched to the Support team.`,
            ticketId: ticket._id,
            ticketCode: ticket.ticketCode,
            bookingId,
            leg,
        };
    } catch (ticketErr) {
        logger.error(`[processDriverCancelRide] Error logging support ticket:`, ticketErr);
        await flagCriticalCancellation(bookingId, driverId, status, reason, leg);
        return {
            success: false,
            reason: "CRITICAL_CANCEL_REQUIRES_SUPPORT",
            message: "Direct cancellation is disabled for active rides. A critical support ticket has been created for the Support team to review and process.",
            bookingId,
            leg,
        };
    }

    const assignmentPath = leg === "PICKUP" ? "pickup.assignment" : "delivery.assignment";
    const nextStatus = leg === "PICKUP" ? BOOKING_STATUS.STORE_ASSIGNED : BOOKING_STATUS.FINAL_PAYMENT_CAPTURED;

    const updatedBooking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            [`${assignmentPath}.driverId`]: objDriverId,
            status: { $in: researchableStatuses },
        },
        {
            $set: {
                status: nextStatus,
                lastStatusUpdatedAt: now,
                [`${assignmentPath}.cancelledAt`]: now,
                [`${assignmentPath}.cancelReason`]: reason,
            },
            $unset: {
                [`${assignmentPath}.driverId`]: "",
                [`${assignmentPath}.assignedAt`]: "",
                [`${assignmentPath}.acceptedAt`]: "",
                [`${assignmentPath}.startedAt`]: "",
                [`${assignmentPath}.otp`]: "",
                [`${assignmentPath}.storageOtp`]: "",
                [`${assignmentPath}.storageReturnOtp`]: "",
                [`${assignmentPath}.returnOtp`]: "",
            },
            $push: {
                timeline: {
                    status: nextStatus,
                    note: `Driver cancelled (${leg}): ${reason || "no reason given"}`,
                    updatedBy: objDriverId,
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (!updatedBooking) {
        return { success: false, reason: "UPDATE_FAILED" };
    }

    // Free the driver and re-add to Redis geo-set for new rides
    const cancelledDriver = await Driver.findByIdAndUpdate(driverId, {
        $set: { is_on_trip: false, current_booking_id: null },
        $inc: { cancel_count: 1 },
    }, { new: true });

    await Promise.all([
        markDriverAvailable(driverId),
        cancelledDriver ? addDriverToRedis(cancelledDriver) : Promise.resolve(),
    ]);

    // Clean up keys
    await Promise.allSettled([
        deleteCache(DriverKeys.assigned(driverId)),
        deleteCache(DriverKeys.offered(driverId)),
        deleteCache(BookingKeys.offer(bookingId)),
        invalidateDriverCache(driverId, bookingId),
        invalidateBookingCache(updatedBooking.userId.toString(), bookingId),
    ]);

    // Schedule new search for leg
    await scheduleDriverSearch(bookingId, leg);

    return {
        success: true,
        action: "DRIVER_RELEASED_SEARCHING",
        bookingId,
        leg,
    };
};

import { OpsKeys, OpsTTL } from "../../constants/redis/ops.keys.js";

async function flagCriticalCancellation(bookingId, driverId, status, reason, leg = "PICKUP") {
    const key = OpsKeys.criticalCancellation(bookingId);
    await redis.hset(key, {
        driverId: driverId || "",
        status,
        reason: reason || "",
        leg,
        flaggedAt: Date.now(),
    });
    await redis.expire(key, OpsTTL.CRITICAL_CANCELLATION);

    logger.error(
        `[CRITICAL] Driver ${driverId} requested cancellation for booking ${bookingId} with luggage in custody (${leg}). Status: ${status}`
    );
}

// ADMIN PROCESS CRITICAL CANCELLATION
export const adminProcessCriticalCancel = async (bookingId, adminId, reason = "") => {
    const now = new Date();

    const booking = await Booking.findById(bookingId)
        .select("status userId storeId pickupLocation deliveryLocation pickup.assignment delivery.assignment criticalHandoverLocation")
        .lean();

    if (!booking) {
        return { success: false, reason: "BOOKING_NOT_FOUND" };
    }

    const isPickupDriver = !!booking.pickup?.assignment?.driverId;
    const isDeliveryDriver = !!booking.delivery?.assignment?.driverId;

    let driverId = null;
    let leg = "PICKUP";

    if (isDeliveryDriver || [BOOKING_STATUS.OUT_FOR_RETURN, BOOKING_STATUS.ARRIVED_FOR_DELIVERY].includes(booking.status)) {
        driverId = booking.delivery?.assignment?.driverId?.toString();
        leg = "DELIVERY";
    } else {
        driverId = booking.pickup?.assignment?.driverId?.toString();
        leg = "PICKUP";
    }

    const assignmentPath = leg === "PICKUP" ? "pickup.assignment" : "delivery.assignment";

    // Capture driver's last known location as criticalHandoverLocation (preserves pickupLocation & deliveryLocation)
    let handoverLocation = null;
    if (driverId) {
        const driver = await Driver.findById(driverId).select("currentLocation").lean();
        if (driver?.currentLocation?.coordinates && driver.currentLocation.coordinates.length === 2) {
            const [lng, lat] = driver.currentLocation.coordinates;
            handoverLocation = {
                lat,
                lng,
                address: driver.currentLocation.address || "Cancelled driver location",
            };
        }
    }

    const nextStatus = BOOKING_STATUS.DRIVER_CANCELLED_CRITICAL;

    const updateObj = {
        $set: {
            status: nextStatus,
            lastStatusUpdatedAt: now,
            [`${assignmentPath}.cancelledAt`]: now,
            [`${assignmentPath}.cancelReason`]: reason || "Admin approved critical cancellation",
            ...(handoverLocation ? { criticalHandoverLocation: handoverLocation } : {}),
        },
        $unset: {
            [`${assignmentPath}.driverId`]: "",
            [`${assignmentPath}.assignedAt`]: "",
            [`${assignmentPath}.acceptedAt`]: "",
            [`${assignmentPath}.startedAt`]: "",
            [`${assignmentPath}.otp`]: "",
            [`${assignmentPath}.storageOtp`]: "",
            [`${assignmentPath}.storageReturnOtp`]: "",
            [`${assignmentPath}.returnOtp`]: "",
        },
        $push: {
            timeline: {
                status: nextStatus,
                note: `Critical cancellation approved by Admin (${leg}). Reason: ${reason || "Admin decision"}`,
                updatedBy: new mongoose.Types.ObjectId(adminId),
                updatedByModel: "Admin",
                createdAt: now,
            },
        },
    };

    const updatedBooking = await Booking.findByIdAndUpdate(bookingId, updateObj, { returnDocument: "after" }).lean();

    if (!updatedBooking) {
        return { success: false, reason: "UPDATE_FAILED" };
    }

    if (driverId) {
        const freedDriver = await Driver.findByIdAndUpdate(driverId, {
            $set: { is_on_trip: false, current_booking_id: null },
            $inc: { cancel_count: 1 },
        }, { new: true });

        await Promise.all([
            markDriverAvailable(driverId),
            freedDriver ? addDriverToRedis(freedDriver) : Promise.resolve(),
            deleteCache(DriverKeys.assigned(driverId)),
            deleteCache(DriverKeys.offered(driverId)),
            invalidateDriverCache(driverId, bookingId),
        ]);
    }

    await deleteCache(BookingKeys.offer(bookingId));
    await invalidateBookingCache(updatedBooking.userId.toString(), bookingId);
    await flagCriticalCancellation(bookingId, driverId, booking.status, reason, leg);

    return {
        success: true,
        action: "CRITICAL_CANCELLED_BY_ADMIN",
        booking: updatedBooking,
        leg,
    };
};

// COMPLETE DELIVERY driver reached the user and handed back the luggage
export const processCompleteDelivery = async (bookingId, driverId, otp, photos = []) => {
    const now = new Date();

    const booking = await Booking.findOne({
        _id: bookingId,
        status: { $in: [BOOKING_STATUS.OUT_FOR_RETURN, BOOKING_STATUS.ARRIVED_FOR_DELIVERY] },
        "delivery.assignment.driverId": new mongoose.Types.ObjectId(driverId),
    });

    if (!booking) return null;

    // OTP Rate limiting Check
    const rateLimitKey = AuthKeys.otpRate("driver", driverId, bookingId);
    const failedAttempts = await getCache(rateLimitKey);
    if (failedAttempts >= 5) {
        throw new Error("Too many failed attempts. Locked out for 15 minutes.");
    }

    // OTP Verification
    if (booking.delivery.assignment.returnOtp !== otp) {
        const fails = await redis.incr(rateLimitKey);
        if (fails === 1) await redis.expire(rateLimitKey, 15 * 60);
        throw new Error("Invalid delivery OTP");
    }

    await deleteCache(rateLimitKey); // clear on success

    const updated = await Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: {
                status: BOOKING_STATUS.DELIVERED,
                lastStatusUpdatedAt: now,
                "delivery.assignment.completedAt": now,
                "luggagePhotos.delivery": photos,
                "payment.status": "paid",
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.DELIVERED,
                    note: "Luggage delivered to user",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (updated) {
        invalidateBookingCache(updated, { storeId: updated.storeId, driverIds: [driverId] }).catch((err) =>
            logger.error(`[processCompleteDelivery] Cache invalidation failed for ${bookingId}:`, err)
        );

        const dropLocation = updated.deliveryLocation || updated.pickupLocation;
        const driverUpdate = {
            is_on_trip: false,
            current_booking_id: null,
        };

        if (dropLocation?.lng && dropLocation?.lat) {
            driverUpdate.currentLocation = {
                type: "Point",
                coordinates: [Number(dropLocation.lng), Number(dropLocation.lat)],
                address: dropLocation.address || "",
                updatedAt: new Date(),
            };
        }

        // Release driver: update MongoDB, re-add to Redis geo-set for new rides
        const releasedDriver = await Driver.findByIdAndUpdate(driverId, {
            $set: driverUpdate,
        }, { returnDocument: "after" });

        await Promise.all([
            markDriverAvailable(driverId),
            releasedDriver ? addDriverToRedis(releasedDriver) : Promise.resolve(),
            deleteCache(DriverKeys.assigned(driverId)),
            deleteCache(DriverKeys.offered(driverId)),
            deleteCache(BookingKeys.offer(bookingId)),
            invalidateDriverCache(driverId, bookingId),
        ]);

        // Trigger Earning status update, Final Invoice Generation and Ledger Fund Distribution asynchronously
        Promise.allSettled([
            import("../../services/fundDistributionService.js").then(({ updateEarningStatus }) => updateEarningStatus(bookingId, "RETURN_DELIVERY", "PAYABLE")),
            import("../../services/invoiceService.js").then(({ generateFinalInvoice }) => generateFinalInvoice(bookingId)),
            import("../../services/fundDistributionService.js").then(({ processBookingFundDistribution }) => processBookingFundDistribution(bookingId)),
        ]).catch((err) => logger.error(`[processCompleteDelivery] Financial processing error for booking ${bookingId}:`, err));
    }

    return updated;
};

// PAGINATION
export { buildPagination } from "../../utils/helper.js";