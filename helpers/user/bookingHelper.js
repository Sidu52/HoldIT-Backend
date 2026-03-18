



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


// Validate that a scheduled time meets minimum lead time
export const validateScheduledTime = (scheduledAt, minLeadMinutes) => {
    const scheduledTime = new Date(scheduledAt);
    const minTime = new Date(Date.now() + minLeadMinutes * 60 * 1000);

    return {
        valid: scheduledTime >= minTime,
        scheduledTime,
    };
};


// ─── USER VERIFICATION ────────────────────────────────────────────────────────

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

// ─── SERVICEABILITY ───────────────────────────────────────────────────────────

/**
 * Check if a pickup location falls within a serviceable area.
 * Returns { isServiceable, serviceAreaId } from checkServiceability util.
 */
export const verifyServiceability = async (lat, lng) => {
    return checkServiceability(lat, lng);
};

// ─── ACTIVE BOOKING LIMIT ─────────────────────────────────────────────────────

/**
 * Check if the user has already reached their max active booking count.
 */
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

// ─── STORE SEARCH & ASSIGNMENT ────────────────────────────────────────────────

/**
 * Find the nearest available store using MongoDB $geoNear.
 * Sorted by distance ASC, available slots DESC.
 * Only returns stores that:
 *   - are active, online, verified
 *   - have available capacity (current_booking_count < max_booking_capacity)
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
                        status:  ACCOUNT_STATUS.ACTIVE,
                    },
                },
            },
            {
                // Compute available slots inline
                $addFields: {
                    availableSlots: {
                        $subtract: ["$max_booking_capacity", "$current_booking_count"],
                    },
                },
            },
            // {
            //     // Only stores with at least 1 free slot
            //     $match: {
            //         availableSlots: { $gte: STORE_SEARCH.MIN_AVAILABLE_CAPACITY },
            //     },
            // },
            {
                // Closest first, most available second
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
        console.error("[bookingHelper] findNearestAvailableStore error:", err.message);
        return { store: null, error: "SEARCH_FAILED" };
    }
};

/**
 * Atomically increment store's current_booking_count.
 * The $expr guard ensures we never exceed max capacity — acts as
 * an optimistic lock so two concurrent bookings can't both take the last slot.
 */
export const assignStoreToBooking = async (storeId, session) => {
    try {
        const store = await Store.findById(storeId);
        const updatedStore = await Store.findOneAndUpdate(
            {
                _id: storeId,
                // Capacity guard — only succeeds if a slot is still free
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
        console.error("[bookingHelper] assignStoreToBooking error:", err.message);
        return { success: false, store: null };
    }
};

/**
 * Decrement store capacity when a booking is cancelled.
 * Guards with $gt: 0 so count never goes negative.
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
        console.error(`[bookingHelper] releaseStoreCapacity failed for ${storeId}:`, err.message);
    }
};

// ─── CANCELLATION ─────────────────────────────────────────────────────────────

/**
 * Single source of truth for system-initiated booking cancellation.
 * Used by:
 *   - autoCancelWorker (no driver found)
 *   - driverAssignHelper (search exhausted)
 *
 * Uses a transaction to atomically cancel + release store capacity.
 * Queues post-cancellation notification job after commit.
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
            console.log(`[AutoCancel] Booking ${bookingId} already in terminal state`);
            return { success: false };
        }

        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session);
        }

        await session.commitTransaction();
        session.endSession();

        // Post-commit side effects — non-fatal if these fail
        await Promise.allSettled([
            queueCancellationNotification(booking),
            invalidateBookingCache(booking.userId.toString(), bookingId),
        ]);

        console.log(`[AutoCancel] Booking ${bookingId} cancelled — reason: ${reason}`);
        return { success: true };
    } catch (err) {
        await safeAbortSession(session);
        console.error(`[AutoCancel] Failed for booking ${bookingId}:`, err.message);
        return { success: false };
    }
};

/**
 * Queue a notification job after a booking is cancelled.
 * Also queues a refund job if the booking was paid.
 */
const queueCancellationNotification = async (booking) => {
    const bookingId = booking._id.toString();
    const userId = booking.userId.toString();

    // Cancellation notification
    addJobToQueue(
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
        console.error(`[bookingHelper] Failed to queue cancel notification for ${bookingId}:`, err.message)
    );

    // Refund job — only if payment was completed
    if (booking.payment?.status === "PAID") {
        addJobToQueue(
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
            console.error(`[bookingHelper] Failed to queue refund for ${bookingId}:`, err.message)
        );
    }
};

// ─── CACHE ────────────────────────────────────────────────────────────────────

export const invalidateBookingCache = async (userId, bookingId = null) => {
    try {
        const ops = [delByPattern(REDIS_KEYS.BOOKING_CACHE_LIST_PATTERN(userId))];

        if (bookingId) {
            ops.push(del(REDIS_KEYS.BOOKING_CACHE_DETAIL(userId, bookingId)));
        }

        await Promise.allSettled(ops);
    } catch (err) {
        console.error("[bookingHelper] Cache invalidation error:", err.message);
    }
};


export const getCachedData = async (cacheKey) => {
    try {
        const cached = await get(cacheKey);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error("[bookingHelper] Cache read error:", err.message);
        return null;
    }
};

export const setCacheData = async (cacheKey, data, ttl) => {
    try {
        await set(cacheKey, JSON.stringify(data), "EX", ttl);
    } catch (err) {
        console.error("[bookingHelper] Cache write error:", err.message);
    }
};

// ─── BOOKING QUERIES ──────────────────────────────────────────────────────────

export const findUserBooking = async (bookingId, userId, selectFields = "") => {
    return Booking.findOne({ _id: bookingId, userId })
        .select(selectFields)
        .lean();
};

// Returns a mutable (non-lean) booking for use with .save()
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

export const buildPagination = (page, limit, total) => {
    const totalPages = Math.ceil(total / limit);
    return {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
};

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

/**
 * Generic job queuer with default options.
 * Use for non-critical background jobs — fire and forget with error logging.
 */
export const queueBookingJob = (queueName, jobName, data, extraOptions = {}) => {
    const jobId = `${jobName}-${data.bookingId ?? Date.now()}`;

    addJobToQueue(
        queueName,
        { name: jobName, data },
        { jobId, ...DEFAULT_JOB_OPTIONS, ...extraOptions }
    ).catch((err) =>
        console.error(`[bookingHelper] Failed to queue ${jobName}:`, err.message)
    );
};