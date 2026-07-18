import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import User from "../../models/User.js";
import { del, delByPattern } from "../../services/redisService.js";
import { addJobToQueue } from "../../services/jobService.js";
import { checkServiceability } from "./addressHelper.js";
import { ACCOUNT_STATUS, BOOKING_STATUS, JOB_QUEUES } from "../../utils/constants.js";
import {
    STORE_SEARCH,
    ACTIVE_STATUSES,
    DEFAULT_JOB_OPTIONS,
    BOOKING_LIMITS,
    REDIS_KEYS,
    BOOKING_JOB_NAMES,
} from "../../constants/user/booking.js";
import { DRIVER_RIDE_CACHE } from "../../constants/driver/driver.ride.js";
import { safeAbortSession } from "../../utils/helper.js";
import logger from "../../utils/logger.js";

// USER VERIFICATION
export const verifyUserForBooking = async (userId, session = null) => {
    const query = User.findById(userId).select("account_status").lean();
    if (session) query.session(session);

    const user = await query;

    if (!user) {
        return { valid: false, user: null, errorType: "NOT_FOUND" };
    }

    if (user.account_status !== ACCOUNT_STATUS.ACTIVE) {
        return { valid: false, user, errorType: "NOT_ACTIVE" };
    }

    return { valid: true, user, errorType: null };
};

// ─── SERVICEABILITY ───────────────────────────────────────────────────────────

/**
 * Thin pass-through kept for import consistency across the codebase.
 * Delegates entirely to the shared utility.
 */
export const verifyServiceability = checkServiceability;

//  ACTIVE BOOKING LIMIT
export const checkActiveBookingLimit = async (userId, session = null) => {
    const query = Booking.countDocuments({
        userId,
        status: { $in: ACTIVE_STATUSES },
    });
    if (session) query.session(session);

    const count = await query;
    return {
        hasReachedLimit: count >= BOOKING_LIMITS.MAX_ACTIVE_BOOKINGS,
        currentCount: count,
    };
};

// STORE SEARCH & ASSIGNMENT
export const findNearestAvailableStore = async (lat, lng, session = null) => {
    try {
        const pipeline = [
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: STORE_SEARCH.MAX_DISTANCE_KM * 1000,
                    query: {
                        is_online: true,
                        verification_status: "verified",
                        account_status: ACCOUNT_STATUS.ACTIVE,
                    },
                },
            },
            {
                $addFields: {
                    availableSlots: {
                        $subtract: ["$max_booking_capacity", "$current_booking_count"],
                    },
                },
            },
            // Only consider stores that actually have capacity
            { $match: { availableSlots: { $gt: 0 } } },
            { $sort: { distance: 1, availableSlots: -1 } },
            { $limit: 1 },
            {
                $project: {
                    _id: 1,
                    store_name: 1,
                    location: 1,
                    distance: 1,
                    availableSlots: 1,
                    max_booking_capacity: 1,
                    current_booking_count: 1,
                    service_area_id: 1,
                },
            },
        ];

        const aggregateOptions = session ? { session } : {};
        const results = await Store.aggregate(pipeline, aggregateOptions);

        if (!results.length) {
            return { store: null, error: "NO_STORE" };
        }

        return { store: results[0], error: null };
    } catch (err) {
        logger.error("[bookingHelper] findNearestAvailableStore error:", err.message);
        return { store: null, error: "SEARCH_FAILED" };
    }
};

// Atomically increments the store's booking count, guarded by a capacity check.
export const assignStoreToBooking = async (storeId, session) => {
    try {
        const updatedStore = await Store.findOneAndUpdate(
            {
                _id: storeId,
                $expr: { $lt: ["$current_booking_count", "$max_booking_capacity"] },
            },
            { $inc: { current_booking_count: 1 } },
            { returnDocument: "after", session, lean: true }
        );

        if (!updatedStore) {
            return { success: false, store: null };
        }

        return { success: true, store: updatedStore };
    } catch (err) {
        logger.error("[bookingHelper] assignStoreToBooking error:", err.message);
        return { success: false, store: null };
    }
};

// LUGGAGE
export const calculateTotalLuggage = (luggage) => {
    const { small = 0, medium = 0, large = 0, other = 0 } = luggage;
    return small + medium + large + other;
};

// RELEASE DRIVER
export const releaseDriver = async (driverId) => {
    if (!driverId) return;
    try {
        const driver = await Driver.findByIdAndUpdate(
            driverId,
            { $set: { is_on_trip: false, current_booking_id: null } },
            { new: true }
        );
        if (driver) {
            const { markDriverAvailable, addDriverToRedis } = await import("../../services/driverGeoService.js");
            await addDriverToRedis(driver);
            await markDriverAvailable(driverId.toString());
        }
    } catch (err) {
        logger.error(`[ReleaseDriver] Failed for driver ${driverId}:`, err.message);
    }
};


/**
 * Decrements the store's booking count, guarded against going below zero.
 * Safe to call even if storeId is null/undefined (no-op).
 */
export const releaseStoreCapacity = async (storeId, session = null) => {
    if (!storeId) return;

    try {
        await Store.findOneAndUpdate(
            { _id: storeId, current_booking_count: { $gt: 0 } },
            { $inc: { current_booking_count: -1 } },
            session ? { session } : {}
        );
    } catch (err) {
        logger.error(
            `[bookingHelper] releaseStoreCapacity failed for store ${storeId}:`,
            err.message
        );
    }
};



// ─── DRIVER SEARCH ────────────────────────────────────────────────────────────

/**
 * @deprecated This is dead code. The actual driver search algorithm runs 
 * asynchronously inside `driverAssignHelper.js` utilizing Redis GEORADIUS indexes.
 * 
 * Finds nearby available drivers by geo proximity.
 * Used by the async driver-search job — NOT called on the booking creation
 * hot path (that would introduce a TOCTOU race).
 *
 * BUG FIXED: original passed `{ session, lean: true }` as aggregate options —
 * `lean` is not a valid aggregate option and is silently ignored.
 * Aggregations always return plain objects; `.lean()` is a Query-only method.
 */
export const findNearbyDrivers = async (lat, lng, session = null, radius = 5000) => {
    try {
        const pipeline = [
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: radius,
                    key: "currentLocation", // explicit field key for multi-index models
                    query: {
                        is_online: true,
                        verification_status: "verified",
                        account_status: ACCOUNT_STATUS.ACTIVE,
                    },
                },
            },
            {
                $addFields: {
                    availableSlots: {
                        $subtract: ["$max_booking_capacity", "$current_booking_count"],
                    },
                },
            },
            { $match: { availableSlots: { $gt: 0 } } },
            { $sort: { distance: 1, availableSlots: -1 } },
            { $limit: 10 },
            {
                $project: {
                    _id: 1,
                    first_name: 1,
                    last_name: 1,
                    phone: 1,
                    vehicle_type: 1,
                    distance: 1,
                    availableSlots: 1,
                    service_area_id: 1,
                },
            },
        ];

        const aggregateOptions = session ? { session } : {};
        return await Driver.aggregate(pipeline, aggregateOptions);
    } catch (err) {
        logger.error("[bookingHelper] findNearbyDrivers error:", err.message);
        return [];
    }
};

// ─── AUTO-CANCEL ──────────────────────────────────────────────────────────────

/**
 * System-initiated atomic booking cancellation.
 * Used by: autoCancelWorker, driverSearchJob (on driver exhaustion).
 *
 * BUG FIXED: original chained `.select()` after `findOneAndUpdate()` — that
 * doesn't work; `.select()` must be part of the query chain before execution.
 * Added explicit projection to the findOneAndUpdate options instead.
 *
 * NOTE: `findOneAndUpdate` bypasses `pre('save')` hooks so `isActive` and
 * `lastStatusUpdatedAt` are set explicitly in the $set here — do not remove them.
 */
export const autoCancelBooking = async (bookingId, reason) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const now = new Date();

        const booking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                status: { $nin: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DELIVERED] },
            },
            {
                $set: {
                    status: BOOKING_STATUS.CANCELLED,
                    isActive: false,
                    cancelledAt: now,
                    cancelledBy: "SYSTEM",
                    cancelReason: reason,
                    lastStatusUpdatedAt: now,
                },
                $push: {
                    timeline: createTimelineEntry(
                        BOOKING_STATUS.CANCELLED,
                        `Auto-cancelled: ${reason}`,
                        null,
                        null
                    ),
                },
            },
            {
                returnDocument: "after",
                // Explicit projection on the options object — the correct API
                projection: { _id: 1, userId: 1, storeId: 1, cancelReason: 1, payment: 1, pricing: 1 },
                session,
            }
        );

        if (!booking) {
            await safeAbortSession(session);
            logger.info(`[AutoCancel] Booking ${bookingId} already terminal or not found.`);
            return { success: false };
        }

        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session);
        }

        await session.commitTransaction();
        session.endSession();

        // Post-commit side-effects — best-effort, individual failures are logged
        const { cleanupBookingRedisKeys } = await import("./driverAssignHelper.js");

        const results = await Promise.allSettled([
            cleanupBookingRedisKeys(bookingId),
            queueCancellationNotification(booking),
            invalidateBookingCache(booking.userId.toString(), bookingId.toString()),
        ]);

        results.forEach((result, i) => {
            if (result.status === "rejected") {
                const labels = ["cleanupRedisKeys", "queueNotification", "invalidateCache"];
                logger.error(
                    `[AutoCancel] Post-commit step '${labels[i]}' failed for booking ${bookingId}:`,
                    result.reason?.message
                );
            }
        });

        logger.info(`[AutoCancel] Booking ${bookingId} cancelled: ${reason}`);
        // Emit socket event to notify user/store/admin about cancellation
        try {
            const { getIO } = await import("../../src/socket/index.js");
            const { emitBookingCancelled } = await import("../../src/socket/emitters/booking.emitter.js");
            const io = (() => { try { return getIO(); } catch { return null; } })();
            if (io) {
                emitBookingCancelled(
                    io,
                    booking._id.toString(),
                    booking.userId?.toString(),
                    booking.storeId?.toString() ?? null,
                    null,
                    "SYSTEM",
                    reason,
                    new Date()
                );
            }
        } catch (socketErr) {
            logger.debug(`[AutoCancel:Socket] Emission skipped: ${socketErr.message}`);
        }
        return { success: true };
    } catch (err) {
        await safeAbortSession(session);
        logger.error(`[AutoCancel] Fatal failure for booking ${bookingId}:`, err);
        return { success: false };
    }
};

/**
 * Queues cancellation notification and, if already paid, a refund job.
 */
const queueCancellationNotification = async (booking) => {
    const bookingId = booking._id.toString();
    const userId = booking.userId.toString();

    await addJobToQueue(
        JOB_QUEUES.BOOKING_CANCELLED,
        {
            name: "BOOKING_CANCELLED",
            data: {
                bookingId,
                userId,
                reason: booking.cancelReason,
                cancelledBy: "SYSTEM",
                type: "AUTO_CANCEL_NO_DRIVER",
            },
        },
        { jobId: `cancel-notify-${bookingId}`, ...DEFAULT_JOB_OPTIONS }
    ).catch((err) =>
        logger.error(
            `[bookingHelper] Failed to queue cancel notification for ${bookingId}:`,
            err.message
        )
    );

    // Only trigger a refund if payment was captured (not just initiated)
    if (booking.payment?.status === "paid") {
        await addJobToQueue(
            JOB_QUEUES.RETURN_PROCESS,
            {
                name: "PROCESS_REFUND",
                data: {
                    bookingId,
                    userId,
                    amount: booking.pricing?.totalAmount ?? 0,
                    transactionId: booking.payment?.transactionId,
                    reason: "Auto-cancelled: No driver available",
                },
            },
            { jobId: `refund-${bookingId}`, ...DEFAULT_JOB_OPTIONS }
        ).catch((err) =>
            logger.error(
                `[bookingHelper] Failed to queue refund for ${bookingId}:`,
                err.message
            )
        );
    }
};

// ─── CACHE ────────────────────────────────────────────────────────────────────

/**
 * Invalidates all booking-related Redis cache keys for a user.
 *
 * BUG FIXED: original wrapped Promise.allSettled in try/catch — allSettled
 * never rejects, so the catch was dead code and individual failures were
 * silently swallowed. Now logs each rejected settlement individually.
 */
export const invalidateBookingCache = async (userId, bookingId = null, storeId = null) => {
    if (!userId) return;

    let resolvedStoreId = storeId;
    let resolvedDriverIds = [];

    if (bookingId) {
        try {
            const booking = await Booking.findById(bookingId)
                .select("storeId pickup.assignment.driverId delivery.assignment.driverId")
                .lean();
            if (booking) {
                if (booking.storeId) resolvedStoreId = booking.storeId.toString();
                if (booking.pickup?.assignment?.driverId) resolvedDriverIds.push(booking.pickup.assignment.driverId.toString());
                if (booking.delivery?.assignment?.driverId) resolvedDriverIds.push(booking.delivery.assignment.driverId.toString());
            }
        } catch (err) {
            logger.error("[Cache] Error fetching booking for invalidation:", err.message);
        }
    }

    const ops = [
        { label: "list-pattern", fn: () => delByPattern(REDIS_KEYS.BOOKING_CACHE_LIST_PATTERN(userId)) },
        { label: "active-key", fn: () => del(REDIS_KEYS.BOOKING_ACTIVE(userId)) },
        { label: "history-pattern", fn: () => delByPattern(REDIS_KEYS.BOOKING_HISTORY_PATTERN(userId)) },
        { label: "admin-summary", fn: () => del("dashboard:summary") },
        { label: "admin-charts", fn: () => delByPattern("dashboard:chart:*") },
    ];

    if (bookingId) {
        ops.push({
            label: "detail-key",
            fn: () => del(REDIS_KEYS.BOOKING_CACHE_DETAIL(userId, bookingId)),
        });
    }

    if (resolvedStoreId) {
        ops.push({
            label: "store-dashboard",
            fn: () => del(`store:dashboard:${resolvedStoreId.toString()}`),
        });
    }

    resolvedDriverIds.forEach((driverId) => {
        ops.push({
            label: `driver-assigned-${driverId}`,
            fn: () => del(DRIVER_RIDE_CACHE.ASSIGNED_KEY(driverId)),
        });
        ops.push({
            label: `driver-active-${driverId}`,
            fn: () => del(DRIVER_RIDE_CACHE.ACTIVE_KEY(driverId)),
        });
        ops.push({
            label: `driver-detail-${driverId}`,
            fn: () => del(DRIVER_RIDE_CACHE.RIDE_DETAIL_KEY(driverId, bookingId)),
        });
        ops.push({
            label: `driver-history-${driverId}`,
            fn: () => delByPattern(`driver:ride_history:${driverId}:*`),
        });
    });

    const results = await Promise.allSettled(ops.map((o) => o.fn()));

    results.forEach((result, i) => {
        if (result.status === "rejected") {
            logger.warn(
                `[Cache] Failed to invalidate '${ops[i].label}' for user ${userId}:`,
                result.reason?.message
            );
        }
    });
};

export { getCachedData, setCacheData } from "../../utils/cache.js";

// ─── BOOKING QUERIES ──────────────────────────────────────────────────────────

/**
 * Lean read — use for any handler that only needs to read booking data.
 */
export const findUserBooking = async (bookingId, userId, selectFields = "") => {
    return Booking.findOne({ _id: bookingId, userId }).select(selectFields).lean();
};

/**
 * Returns a full Mongoose document (non-lean) for handlers that call .save().
 *
 * BUG FIXED: original silently dropped the session parameter — transactional
 * controllers (cancelBooking, requestReturn) need the read to join the session
 * so they see their own in-progress writes (read-your-own-writes).
 */
export const findMutableUserBooking = async (
    bookingId,
    userId,
    selectFields = "",
    session = null
) => {
    const query = Booking.findOne({ _id: bookingId, userId }).select(selectFields);
    if (session) query.session(session);
    return query;
};

export const findStore = async (storeId, selectFields = "") => {
    return Store.findById(storeId).select(selectFields).lean();
};

export const findDriver = async (driverId, selectFields = "") => {
    return Driver.findById(driverId).select(selectFields).lean();
};

// ─── PAGINATION ───────────────────────────────────────────────────────────────

export { buildPagination } from "../../utils/helper.js";

// ─── TIMELINE ─────────────────────────────────────────────────────────────────

export const createTimelineEntry = (
    status,
    note,
    updatedBy = null,
    updatedByModel = null
) => {
    const entry = { status, note, createdAt: new Date() };
    if (updatedBy) {
        entry.updatedBy = updatedBy;
        entry.updatedByModel = updatedByModel;
    }
    return entry;
};


// ─── JOB HELPER ───────────────────────────────────────────────────────────────

/**
 * Queues a booking-related job.
 *
 * BUG FIXED: original swallowed errors via an internal .catch() — callers in
 * the controller wrap this in try/catch expecting it to throw on failure so
 * they can log at the right level. The internal .catch() intercepted first,
 * making the outer try/catch dead code.
 *
 * This function now throws on failure. Callers are responsible for handling errors.
 */
export const queueBookingJob = async (queueName, jobName, data, extraOptions = {}) => {
    const jobId = `${jobName}-${data.bookingId ?? Date.now()}`;

    await addJobToQueue(
        queueName,
        { name: jobName, data },
        { jobId, ...DEFAULT_JOB_OPTIONS, ...extraOptions }
    );
};

// booking
export const processReturnBooking = async (bookingId, userId, returnLocation, notes) => {
    const now = new Date();

    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            userId: new mongoose.Types.ObjectId(userId),
            status: { $in: [BOOKING_STATUS.STORED] },
        },
        {
            $set: {
                status: BOOKING_STATUS.RETURN_REQUESTED,
                deliveryLocation: {
                    lat: returnLocation.lat,
                    lng: returnLocation.lng,
                    address: returnLocation.address ?? "",
                },
                "delivery.requestedAt": now,
                lastStatusUpdatedAt: now,
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.RETURN_REQUESTED,
                    note: notes ? `Return requested by user: ${notes}` : "Return requested by user",
                    updatedBy: new mongoose.Types.ObjectId(userId),
                    updatedByModel: "User",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (!booking) return null;

    const { cleanupBookingRedisKeys } = await import("./driverAssignHelper.js");

    const tasks = [
        { label: "cleanupRedisKeys", promise: cleanupBookingRedisKeys(bookingId) },
        {
            label: "queueReturnJob",
            promise: queueBookingJob(
                JOB_QUEUES.RETURN_PROCESS,
                BOOKING_JOB_NAMES.PROCESS_RETURN,
                { bookingId }
            ),
        },
        {
            label: "queueNoDriverRevertCheck",
            promise: queueBookingJob(
                JOB_QUEUES.RETURN_PROCESS,
                BOOKING_JOB_NAMES.REVERT_IF_NO_DRIVER,
                { bookingId },
                {
                    jobId: `revert-return-${bookingId}`, 
                    delay: 2000,
                }
            ),
        },
        { label: "invalidateCache", promise: invalidateBookingCache(userId, bookingId) },
    ];
    const results = await Promise.allSettled(tasks.map((t) => t.promise));

    results.forEach((result, i) => {
        if (result.status === "rejected") {
            logger.error(
                `[processReturnBooking] Post-commit step '${tasks[i].label}' failed for booking ${bookingId}:`,
                result.reason?.message
            );
        }
    });

    return booking;
};