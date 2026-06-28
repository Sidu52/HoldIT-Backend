import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { BOOKING_STATUS, JOB_QUEUES, STATUS_CODES } from "../../utils/constants.js";
import { addJobToQueue } from "../../services/jobService.js";
import {
    DRIVER_ASSIGN_QUEUE,
    DRIVER_JOB_NAMES,
    BOOKING_CACHE,
    BOOKING_LIMITS,
    CANCELLABLE_STATUSES,
    RETURN_REQUESTABLE_STATUSES,
    ACTIVE_STATUSES,
    HISTORY_STATUSES,
    BOOKING_JOB_NAMES,
    BOOKING_SELECT,
    BOOKING_MESSAGES,
} from "../../constants/user/booking.js";
import {
    invalidateBookingCache,
    getCachedData,
    setCacheData,
    verifyUserForBooking,
    verifyServiceability,
    checkActiveBookingLimit,
    validateScheduledTime,
    calculateTotalLuggage,
    findUserBooking,
    findMutableUserBooking,
    buildPagination,
    createTimelineEntry,
    queueBookingJob,
    releaseStoreCapacity,
    findNearestAvailableStore,
    findNearbyDrivers,
    assignStoreToBooking,
    findStore,
    findDriver,
} from "../../helpers/user/bookingHelper.js";
import { STORE_MESSAGES } from "../../constants/user/store.js";
import { DRIVER_MESSAGES } from "../../constants/user/driver.js";
import { safeAbortSession } from "../../utils/helper.js";
import logger from "../../utils/logger.js";
import { getIO } from "../../src/socket/index.js";
import { emitBookingCreated, emitBookingStoreAssigned, emitStoreIncomingBooking, emitBookingReturnRequested } from "../../src/socket/emitters/booking.emitter.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";

// ─── SCHEDULE PICKUP ──────────────────────────────────────────────────────────
/**
 * Creates a new pickup booking inside a transaction.
 * Order of operations:
 *   1. Verify user is active
 *   2. Verify pickup location is serviceable
 *   3. Enforce max-active-bookings limit
 *   4. Find + atomically reserve nearest store capacity
 *   5. Create the booking document
 *   6. Commit — then dispatch driver-search job outside the transaction
 *
 * Driver availability is intentionally NOT a hard gate here.
 * We create the booking and let the async driver-search job handle assignment.
 * Checking "are there drivers nearby?" before committing creates a TOCTOU race
 * (drivers go offline between the check and job dispatch) and adds latency to
 * the hot path. The job will handle the no-driver case and notify the user.
 */
export const schedulePickup = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const {
            pickupLocation,
            luggage,
            notes,
            tipAmount,
            coupenCode,
            userInfo,
        } = req.body;

        // userInfo is optional — guests may not supply it
        const { firstName = "", lastName = "", phone = "" } = userInfo ?? {};

        // ── 1. Verify user ────────────────────────────────────────────────────
        const { valid, errorType } = await verifyUserForBooking(userId, session);
        if (!valid) {
            await safeAbortSession(session);
            return sendError(
                res,
                errorType === "NOT_FOUND"
                    ? BOOKING_MESSAGES.USER_NOT_FOUND
                    : BOOKING_MESSAGES.ACCOUNT_NOT_ACTIVE,
                errorType === "NOT_FOUND"
                    ? STATUS_CODES.NOT_FOUND
                    : STATUS_CODES.FORBIDDEN
            );
        }

        // ── 2. Serviceability check ───────────────────────────────────────────
        const serviceabilityResult = await checkServiceability(
            pickupLocation.lng,
            pickupLocation.lat
        );
        console.log("Serviceability Result:", pickupLocation);
        if (!serviceabilityResult.isServiceable) {
            await safeAbortSession(session);
            return sendError(
                res,
                serviceabilityResult.error === "DB_ERROR"
                    ? BOOKING_MESSAGES.SCHEDULE_FAILED
                    : BOOKING_MESSAGES.NOT_SERVICEABLE,
                serviceabilityResult.error === "DB_ERROR"
                    ? STATUS_CODES.INTERNAL_SERVER_ERROR
                    : STATUS_CODES.FORBIDDEN
            );
        }
        const { serviceAreaId } = serviceabilityResult;

        // ── 3. Active booking limit ───────────────────────────────────────────
        const { hasReachedLimit } = await checkActiveBookingLimit(userId, session);
        if (hasReachedLimit) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.MAX_ACTIVE_REACHED(BOOKING_LIMITS.MAX_ACTIVE_BOOKINGS),
                STATUS_CODES.CONFLICT
            );
        }

        // ── 4. Find + reserve store ───────────────────────────────────────────
        const { store, error: storeError } = await findNearestAvailableStore(
            pickupLocation.lat,
            pickupLocation.lng,
            session
        );
        if (!store) {
            await safeAbortSession(session);
            return sendError(
                res,
                storeError === "NO_STORE"
                    ? BOOKING_MESSAGES.NO_STORE_AVAILABLE
                    : BOOKING_MESSAGES.SCHEDULE_FAILED,
                storeError === "NO_STORE"
                    ? STATUS_CODES.NOT_FOUND
                    : STATUS_CODES.INTERNAL_SERVER_ERROR
            );
        }

        const { success: storeAssigned } = await assignStoreToBooking(store._id, session);
        if (!storeAssigned) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.STORE_AT_CAPACITY, STATUS_CODES.CONFLICT);
        }

        // ── 5. Create booking ─────────────────────────────────────────────────
        const totalCount = calculateTotalLuggage(luggage);

        const [booking] = await Booking.create(
            [
                {
                    userId,
                    storeId: store._id,
                    serviceAreaId: serviceAreaId ?? store.service_area_id,
                    status: BOOKING_STATUS.STORE_ASSIGNED,
                    tipAmount,
                    coupenCode,
                    userInfo: { firstName, lastName, phone },
                    pickupLocation: {
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        address: pickupLocation.address ?? "",
                    },
                    luggage: { ...luggage, totalCount },
                    notes: notes ?? "",
                    pickup: { scheduledAt: new Date() }, // use Date not Date.now() for Mongoose Date fields
                    timeline: [
                        createTimelineEntry(
                            BOOKING_STATUS.CREATED,
                            "Booking created by user",
                            userId,
                            "User"
                        ),
                        createTimelineEntry(
                            BOOKING_STATUS.STORE_ASSIGNED,
                            `Store assigned: ${store.store_name}`,
                            null,
                            null
                        ),
                    ],
                },
            ],
            { session }
        );

        // ── 6. Commit ─────────────────────────────────────────────────────────
        await session.commitTransaction();
        session.endSession();

        // Notify sockets about the new booking and store assignment
        try {
            const io = (() => { try { return getIO(); } catch { return null; } })();
            if (io) {
                emitBookingCreated(io, booking);
                emitBookingStoreAssigned(io, booking._id.toString(), userId, store);
                // small summary for store notification
                emitStoreIncomingBooking(io, booking._id.toString(), store._id.toString(), {
                    bookingCode: booking.bookingCode,
                    pickupLocation: booking.pickupLocation,
                    scheduledAt: booking.pickup.scheduledAt,
                });
            }
        } catch (socketErr) {
            logger.warn("[schedulePickup] Socket notify failed:", socketErr.message);
        }

        // ── Post-commit: dispatch driver-search job ───────────────────────────
        // Errors here are non-fatal — log and alert; booking already exists.
        try {
            await addJobToQueue(
                DRIVER_ASSIGN_QUEUE,
                {
                    name: DRIVER_JOB_NAMES.SEARCH_DRIVERS,
                    data: {
                        bookingId: booking._id.toString(),
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        type: "PICKUP",
                    },
                },
                {
                    jobId: `search-drivers-pickup-${booking._id}`,
                    delay: 2000,
                    removeOnComplete: true,
                    removeOnFail: { count: 50 },
                }
            );
        } catch (jobErr) {
            logger.error(
                `[schedulePickup] Driver search job failed for booking ${booking._id}. ` +
                `Booking created but driver search not started. Error: ${jobErr.message}`
            );
            // TODO: push an alert / dead-letter so ops can manually trigger the search
        }

        // Cache invalidation is best-effort — never block the response
        invalidateBookingCache(userId).catch((err) =>
            logger.warn("[schedulePickup] Cache invalidation failed:", err.message)
        );

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: BOOKING_MESSAGES.PICKUP_SCHEDULED,
            data: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: booking.status,
                scheduledAt: booking.pickup.scheduledAt,
                luggage: {
                    small: luggage.small ?? 0,
                    medium: luggage.medium ?? 0,
                    large: luggage.large ?? 0,
                    other: luggage.other ?? 0,
                    totalCount,
                },
                store: {
                    id: store._id,
                    name: store.store_name,
                    address: store.location,
                    distanceKm: parseFloat((store.distance / 1000).toFixed(2)),
                },
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[schedulePickup] Unhandled error:", err);
        return sendError(res, BOOKING_MESSAGES.SCHEDULE_FAILED);
    }
};

// ─── GET MY BOOKINGS ──────────────────────────────────────────────────────────
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

        const cacheKey = BOOKING_CACHE.LIST_KEY(userId, pageNum, limitNum, status, sort_order);
        const cached = await getCachedData(cacheKey);
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

        await setCacheData(cacheKey, responseData, BOOKING_CACHE.LIST_TTL);

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

// ─── GET BOOKING BY ID ────────────────────────────────────────────────────────
export const getBookingById = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        const cacheKey = BOOKING_CACHE.DETAIL_KEY(userId, booking_id);
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return sendResponse({ res, message: BOOKING_MESSAGES.BOOKING_FETCHED, data: cached });
        }

        // findUserBooking returns a lean object — correct for reads
        const booking = await findUserBooking(booking_id, userId, BOOKING_SELECT.DETAIL);
        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await setCacheData(cacheKey, booking, BOOKING_CACHE.DETAIL_TTL);

        return sendResponse({ res, message: BOOKING_MESSAGES.BOOKING_FETCHED, data: booking });
    } catch (err) {
        logger.error("[getBookingById] Error:", err);
        return sendError(res, BOOKING_MESSAGES.FETCH_DETAIL_FAILED);
    }
};

// ─── CANCEL BOOKING ───────────────────────────────────────────────────────────
/**
 * Uses a transaction + optimistic concurrency (__v) to safely cancel.
 * The select projection explicitly includes all fields needed plus __v
 * so Mongoose's optimistic concurrency check works correctly.
 */
export const cancelBooking = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const { booking_id } = req.params;
        const { reason } = req.body;

        // Explicit select — never concatenate projection strings (fragile + silent bugs)
        // __v is REQUIRED for optimistic concurrency (optimisticConcurrency: true on schema)
        const booking = await Booking.findOne({ _id: booking_id, userId })
            .select("status isActive storeId payment pricing timeline cancelledAt cancelledBy cancelReason __v")
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
        booking.payment.status = "pending"; // will be updated by payment job

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

        // Cache bust + job dispatch are post-commit best-effort
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
                emitBookingCancelled(io, booking_id, userId, booking.storeId ? booking.storeId.toString() : null, null, "USER", reason, booking.cancelledAt || new Date());
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

// ─── GET ACTIVE BOOKINGS ──────────────────────────────────────────────────────
export const getActiveBookings = async (req, res) => {
    try {
        const userId = req.user.auth_id;

        const cacheKey = BOOKING_CACHE.ACTIVE_KEY(userId);
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return sendResponse({ res, message: BOOKING_MESSAGES.ACTIVE_FETCHED, data: cached });
        }

        const bookings = await Booking.find({
            userId,
            status: { $in: ACTIVE_STATUSES },
        })
            .select(BOOKING_SELECT.LIST)
            .sort({ createdAt: -1 })
            .lean();

        const responseData = { bookings, total: bookings.length };

        await setCacheData(cacheKey, responseData, BOOKING_CACHE.ACTIVE_TTL);

        return sendResponse({ res, message: BOOKING_MESSAGES.ACTIVE_FETCHED, data: responseData });
    } catch (err) {
        logger.error("[getActiveBookings] Error:", err);
        return sendError(res, BOOKING_MESSAGES.ACTIVE_FETCH_FAILED);
    }
};

// ─── GET BOOKING HISTORY ──────────────────────────────────────────────────────
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

        const cacheKey = BOOKING_CACHE.HISTORY_KEY(userId, pageNum, limitNum, sort_order);
        const cached = await getCachedData(cacheKey);
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

        await setCacheData(cacheKey, responseData, BOOKING_CACHE.HISTORY_TTL);

        return sendResponse({ res, message: BOOKING_MESSAGES.HISTORY_FETCHED, data: responseData });
    } catch (err) {
        logger.error("[getBookingHistory] Error:", err);
        return sendError(res, BOOKING_MESSAGES.HISTORY_FETCH_FAILED);
    }
};

// ─── REQUEST RETURN ───────────────────────────────────────────────────────────
/**
 * Wrapped in a transaction so the status update + timeline push are atomic.
 * The job is dispatched post-commit (same pattern as schedulePickup).
 */
export const requestReturn = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const { booking_id } = req.params;
        const { returnLocation, returnScheduledAt, notes } = req.body;

        // findMutableUserBooking returns a Mongoose document (needed for .save())
        const booking = await findMutableUserBooking(
            booking_id,
            userId,
            // Ensure __v is selected for optimistic concurrency
            `${BOOKING_SELECT.RETURN} __v`,
            session
        );

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        if (!RETURN_REQUESTABLE_STATUSES.includes(booking.status)) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.CANNOT_RETURN(booking.status),
                STATUS_CODES.CONFLICT
            );
        }

        const { valid: timeValid, scheduledTime: returnTime } = validateScheduledTime(
            returnScheduledAt,
            BOOKING_LIMITS.MIN_RETURN_LEAD_MINUTES
        );

        if (!timeValid) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.RETURN_TOO_SOON(BOOKING_LIMITS.MIN_RETURN_LEAD_MINUTES),
                STATUS_CODES.BAD_REQUEST
            );
        }

        booking.status = BOOKING_STATUS.RETURN_REQUESTED;
        booking.deliveryLocation = {
            lat: returnLocation.lat,
            lng: returnLocation.lng,
            address: returnLocation.address ?? "",
        };
        booking.delivery = {
            ...booking.delivery,
            requestedAt: new Date(),
            scheduledAt: returnTime,
        };

        booking.timeline.push(
            createTimelineEntry(
                BOOKING_STATUS.RETURN_REQUESTED,
                notes ? `Return requested by user: ${notes}` : "Return requested by user",
                userId,
                "User"
            )
        );

        await booking.save({ session });
        await session.commitTransaction();
        session.endSession();

        // Post-commit: cache bust + job dispatch
        await invalidateBookingCache(userId, booking_id).catch((err) =>
            logger.warn("[requestReturn] Cache invalidation failed:", err.message)
        );

        try {
            await queueBookingJob(
                JOB_QUEUES.RETURN_PROCESS,
                BOOKING_JOB_NAMES.PROCESS_RETURN,
                { bookingId: booking_id }
            );
        } catch (jobErr) {
            logger.error(
                `[requestReturn] Failed to queue return job for booking ${booking_id}:`,
                jobErr.message
            );
        }

        // Emit socket event: return requested
        try {
            const io = (() => { try { return getIO(); } catch { return null; } })();
            if (io) {
                emitBookingReturnRequested(
                    io,
                    booking_id,
                    userId,
                    booking.storeId ? booking.storeId.toString() : null,
                    booking.deliveryLocation,
                    booking.delivery?.scheduledAt || null
                );
            }
        } catch (socketErr) {
            logger.debug(`[requestReturn:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.RETURN_REQUESTED,
            data: {
                bookingId: booking._id,
                status: booking.status,
                returnScheduledAt: returnTime,
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[requestReturn] Error:", err);
        return sendError(res, BOOKING_MESSAGES.RETURN_FAILED);
    }
};

// ─── GET ASSIGNED DRIVER ──────────────────────────────────────────────────────
/**
 * Read-only endpoint — use findUserBooking (lean) not findMutableUserBooking.
 * Delivery driver takes precedence over pickup driver when both exist,
 * since that reflects the most current assignment.
 */
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

        // Delivery driver takes precedence (most recent assignment)
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

// ─── GET ASSIGNED STORE ───────────────────────────────────────────────────────
export const getAssignStore = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        // Lean read — no mutation
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