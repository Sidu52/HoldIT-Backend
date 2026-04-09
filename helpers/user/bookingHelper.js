import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import User from "../../models/User.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { addJobToQueue } from "../../services/jobService.js";
import { checkServiceability } from "../../utils/serviceable.js";
import { ACCOUNT_STATUS, BOOKING_STATUS, JOB_QUEUES } from "../../utils/constants.js";
import {
    STORE_SEARCH,
    ACTIVE_STATUSES,
    DEFAULT_JOB_OPTIONS,
    BOOKING_LIMITS,
    REDIS_KEYS,
} from "../../constants/user/booking.js";
import { safeAbortSession } from "../../utils/helper.js";
import logger from "../../utils/logger.js";

// Validate that a scheduled time meets minimum lead time
export const validateScheduledTime = (scheduledAt, minLeadMinutes) => {
    const scheduledTime = new Date(scheduledAt);
    const minTime = new Date(Date.now() + minLeadMinutes * 60 * 1000);

    return {
        valid: scheduledTime >= minTime,
        scheduledTime,
    };
};

// USER VERIFICATION
export const verifyUserForBooking = async (userId, session = null) => {
    const query = User.findById(userId)
        .select("status is_active")
        .lean();

    if (session) query.session(session);

    const user = await query;

    if (!user) {
        return { valid: false, user: null, errorType: "NOT_FOUND" };
    }

    if (user.status !== ACCOUNT_STATUS.ACTIVE || !user.is_active) {
        return { valid: false, user, errorType: "NOT_ACTIVE" };
    }

    return { valid: true, user, errorType: null };
};

// SERVICEABILITY

// Check if a pickup location falls within a serviceable area.
// Returns { isServiceable, serviceAreaId } from checkServiceability util.
export const verifyServiceability = async (lat, lng) => {
    return checkServiceability(lat, lng);
};

// Check if the user has already reached their max active booking count.
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
/**
 * Find the nearest available store using MongoDB $geoNear.
 */
export const findNearestAvailableStore = async (lat, lng, session = null) => {
    try {
        const pipeline = [
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [lng, lat],
                    },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: STORE_SEARCH.MAX_DISTANCE_KM * 1000,
                    query: {
                        is_active: true,
                        is_online: true,
                        verification_status: "verified",
                        status: ACCOUNT_STATUS.ACTIVE,
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
            {
                $sort: { distance: 1, availableSlots: -1 },
            },
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

        const options = session ? { session } : {};
        const results = await Store.aggregate(pipeline).option(options);

        if (!results.length) {
            return { store: null, error: "NO_STORE" };
        }

        return { store: results[0], error: null };
    } catch (err) {
        logger.error("[bookingHelper] findNearestAvailableStore error:", err.message);
        return { store: null, error: "SEARCH_FAILED" };
    }
};

// DRIVER SEARCH
export const findNearbyDrivers = async (lat, lng, session, radius = 5000) => {
    const pipeline = [
        {
            $geoNear: {
                near: {
                    type: "Point",
                    coordinates: [lng, lat],
                },
                distanceField: "distance",
                spherical: true,
                maxDistance: radius,
                key: "currentLocation",  // ✅ explicitly point to the field
                query: {
                    is_active: true,
                    is_online: true,
                    verification_status: "verified",
                    status: ACCOUNT_STATUS.ACTIVE,
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
        { $sort: { distance: 1, availableSlots: -1 } },
        { $limit: 10 },
        {
            $project: {
                _id: 1,
                driver_name: 1,
                location: 1,
                distance: 1,
                availableSlots: 1,
                max_booking_capacity: 1,
                current_booking_count: 1,
                service_area_id: 1,
            },
        },
    ];

    const results = await Driver.aggregate(pipeline, { session, lean: true });
    return results;
};

/**
 * Atomically increment store's current_booking_count.
 */
export const assignStoreToBooking = async (storeId, session) => {
    try {
        const updatedStore = await Store.findOneAndUpdate(
            {
                _id: storeId,
                $expr: {
                    $lt: ["$current_booking_count", "$max_booking_capacity"],
                },
            },
            { $inc: { current_booking_count: 1 } },
            { returnDocument: "after", session }
        ).lean();

        if (!updatedStore) {
            return { success: false, store: null };
        }

        return { success: true, store: updatedStore };
    } catch (err) {
        logger.error("[bookingHelper] assignStoreToBooking error:", err.message);
        return { success: false, store: null };
    }
};

/**
 * Decrement store capacity when a booking is cancelled.
 */
export const releaseStoreCapacity = async (storeId, session = null) => {
    if (!storeId) return;

    try {
        const options = session ? { session } : {};
        await Store.findOneAndUpdate(
            { _id: storeId, current_booking_count: { $gt: 0 } },
            { $inc: { current_booking_count: -1 } },
            options
        );
    } catch (err) {
        logger.error(`[bookingHelper] releaseStoreCapacity failed for ${storeId}:`, err.message);
    }
};

// ─── CANCELLATION ─────────────────────────────────────────────────────────────

/**
 * Atomic system-initiated booking cancellation.
 * Unified version used by: autoCancelWorker, driverSearchJob (exhaustion).
 */
export const autoCancelBooking = async (bookingId, reason) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const now = new Date();

        const booking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                status: {
                    $nin: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DELIVERED],
                },
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
            { returnDocument: "after", session }
        ).select("_id userId storeId cancelReason payment pricing");

        if (!booking) {
            await safeAbortSession(session);
            logger.info(`[AutoCancel] Booking ${bookingId} already terminal or not found`);
            return { success: false };
        }

        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session);
        }

        await session.commitTransaction();
        session.endSession();

        // --- POST-COMMIT SIDE EFFECTS ---
        try {
            // Lazy import to avoid circular dependency
            const { cleanupBookingRedisKeys } = await import("./driverAssignHelper.js");

            await Promise.allSettled([
                cleanupBookingRedisKeys(bookingId),
                queueCancellationNotification(booking),
                invalidateBookingCache(booking.userId.toString(), bookingId),
            ]);
        } catch (postErr) {
            logger.error(`[AutoCancel] Post-commit cleanup error for ${bookingId}:`, postErr.message);
        }

        logger.info(`[AutoCancel] Booking ${bookingId} auto-cancelled: ${reason}`);
        return { success: true };
    } catch (err) {
        await safeAbortSession(session);
        logger.error(`[AutoCancel] Fatal failure for ${bookingId}:`, err);
        return { success: false };
    }
};

/**
 * Queue a notification job after a booking is cancelled.
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
        {
            jobId: `cancel-notify-${bookingId}`,
            ...DEFAULT_JOB_OPTIONS,
        }
    ).catch((err) =>
        logger.error(`[bookingHelper] Failed to queue cancel notification for ${bookingId}:`, err.message)
    );

    if (booking.payment?.status === "PAID") {
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
            {
                jobId: `refund-${bookingId}`,
                ...DEFAULT_JOB_OPTIONS,
            }
        ).catch((err) =>
            logger.error(`[bookingHelper] Failed to queue refund for ${bookingId}:`, err.message)
        );
    }
};

// CACHE 
export const invalidateBookingCache = async (userId, bookingId = null) => {
    if (!userId) return;

    try {
        const ops = [
            delByPattern(REDIS_KEYS.BOOKING_CACHE_LIST_PATTERN(userId)),
            del(REDIS_KEYS.BOOKING_ACTIVE(userId)),
            delByPattern(REDIS_KEYS.BOOKING_HISTORY_PATTERN(userId)),
        ];

        if (bookingId) {
            ops.push(del(REDIS_KEYS.BOOKING_CACHE_DETAIL(userId, bookingId)));
        }

        await Promise.allSettled(ops);
        logger.debug(`[Cache] Invalidated booking caches for user ${userId}`);
    } catch (err) {
        logger.error("[bookingHelper] Cache invalidation error:", err.message);
    }
};

export { getCachedData, setCacheData } from "../../utils/cacheHelper.js";

// BOOKING QUERIES
export const findUserBooking = async (bookingId, userId, selectFields = "") => {
    return Booking.findOne({ _id: bookingId, userId })
        .select(selectFields)
        .lean();
};

export const findMutableUserBooking = async (bookingId, userId, selectFields = "") => {
    return Booking.findOne({ _id: bookingId, userId }).select(selectFields);
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
    const entry = {
        status,
        note,
        createdAt: new Date(),
    };

    if (updatedBy) {
        entry.updatedBy = updatedBy;
        entry.updatedByModel = updatedByModel;
    }

    return entry;
};

// ─── LUGGAGE ──────────────────────────────────────────────────────────────────

export const calculateTotalLuggage = (luggage) => {
    const { small = 0, medium = 0, large = 0, other = 0 } = luggage;
    return small + medium + large + other;
};

// ─── JOB HELPER ───────────────────────────────────────────────────────────────

export const queueBookingJob = async (queueName, jobName, data, extraOptions = {}) => {
    const jobId = `${jobName}-${data.bookingId ?? Date.now()}`;

    await addJobToQueue(
        queueName,
        { name: jobName, data },
        { jobId, ...DEFAULT_JOB_OPTIONS, ...extraOptions }
    ).catch((err) =>
        logger.error(`[bookingHelper] Failed to queue ${jobName}:`, err.message)
    );
};