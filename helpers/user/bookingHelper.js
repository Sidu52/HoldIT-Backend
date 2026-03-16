import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import User from "../../models/User.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { addJobToQueue } from "../../services/jobService.js";
import { checkServiceability } from "../../utils/serviceable.js";
import { ACCOUNT_STATUS } from "../../utils/constants.js";
import {
    STORE_SEARCH,
    ACTIVE_STATUSES,
    BOOKING_JOB_NAMES,
    DEFAULT_JOB_OPTIONS,
    BOOKING_LIMITS,
    BOOKING_CACHE,
} from "../../constants/user/booking.js";
import {
    STORE_VISIBILITY_FILTER,
} from "../../constants/user/store.js";

export const autoCancelBooking = async (bookingId, reason) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();
        const booking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                status: {
                    $in: [
                        BOOKING_STATUS.STORE_ASSIGNED,
                        BOOKING_STATUS.DRIVER_SEARCH,
                    ],
                },
            },
            {
                $set: {
                    status: BOOKING_STATUS.CANCELLED,
                    isActive: false,
                    cancelledAt: new Date(),
                    cancelledBy: "SYSTEM",
                    cancelReason: reason,
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
                new: true,
                session,
            }
        );

        if (!booking) {
            await session.abortTransaction();
            session.endSession();
            console.log(`[AutoCancel] Booking ${bookingId} not found or already handled.`);
            return { success: false };
        }
        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session);
        }

        await session.commitTransaction();
        session.endSession();
        queuePostCancellationJobs(booking);
        await invalidateBookingCache(booking.userId.toString(), bookingId);

        console.log(`[AutoCancel] Booking ${bookingId} auto-cancelled: ${reason}`);
        return { success: true };
    } catch (err) {
        try {
            if (session.inTransaction()) await session.abortTransaction();
        } catch (_) {}
        session.endSession();

        console.error(`[AutoCancel] Failed for booking ${bookingId}:`, err);
        return { success: false };
    }
};

export const releaseStoreCapacity = async (storeId, session) => {
    try {
        await Store.findOneAndUpdate(
            {
                _id: storeId,
                booking_assigned_count: { $gt: 0 },
            },
            {
                $inc: { booking_assigned_count: -1 },
            },
            { session }
        );
    } catch (err) {
        console.error(`[Store] Failed to release capacity for ${storeId}:`, err);
    }
};

const queuePostCancellationJobs = (booking) => {
    const bookingId = booking._id.toString();
    const userId = booking.userId.toString();
    addJobToQueue(
        JOB_QUEUES.BOOKING_CANCELLED,
        {
            name: BOOKING_JOB_NAMES.BOOKING_CANCELLED,
            data: {
                bookingId,
                userId,
                reason: booking.cancelReason,
                cancelledBy: "SYSTEM",
                type: "AUTO_CANCEL_NO_DRIVER",
            },
        },
        {
            jobId: `auto-cancel-notify-${bookingId}`,
            ...DEFAULT_JOB_OPTIONS,
        }
    ).catch((err) => console.error("Failed to queue cancel notification:", err));

    // ---- Process refund if payment was made ----
    // if (booking.payment?.status === "PAID") {
    //     addJobToQueue(
    //         "refund-process",
    //         {
    //             name: "PROCESS_REFUND",
    //             data: {
    //                 bookingId,
    //                 userId,
    //                 amount: booking.pricing?.totalAmount || 0,
    //                 transactionId: booking.payment?.transactionId,
    //                 reason: "Auto-cancelled: No driver available",
    //             },
    //         },
    //         {
    //             jobId: `refund-${bookingId}`,
    //             ...DEFAULT_JOB_OPTIONS,
    //         }
    //     ).catch((err) => console.error("Failed to queue refund:", err));
    // }
};

export const isBookingAwaitingDriver = async (bookingId) => {
    const booking = await Booking.findById(bookingId)
        .select("status pickup.assignment.driverId")
        .lean();

    if (!booking) return { awaiting: false, reason: "NOT_FOUND" };

    if (booking.status === BOOKING_STATUS.CANCELLED) {
        return { awaiting: false, reason: "CANCELLED" };
    }

    if (booking.pickup?.assignment?.driverId) {
        return { awaiting: false, reason: "ALREADY_ASSIGNED" };
    }

    if (
        booking.status === BOOKING_STATUS.STORE_ASSIGNED ||
        booking.status === BOOKING_STATUS.DRIVER_SEARCH
    ) {
        return { awaiting: true, reason: null };
    }

    return { awaiting: false, reason: "INVALID_STATUS" };
};


// Find nearest available store
export const findNearestAvailableStore = async (lat, lng, session = null) => {
    try {
        console.log("S------------STore-----------",lat,lng)
        const maxDistanceMeters = STORE_SEARCH.MAX_DISTANCE_KM * 1000;

        const pipeline = [
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [lng, lat],
                    },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: maxDistanceMeters,
                    query: {
                        ...STORE_VISIBILITY_FILTER,
                    },
                },
            },
            {
                $addFields: {
                    availableSlots: {
                        $subtract: ["$max_booking_capacity", "$booking_assigned_count"],
                    },
                },
            },
            // {
            //     $match: {
            //         availableSlots: { $gte: STORE_SEARCH.MIN_AVAILABLE_CAPACITY },
            //     },
            // },
            {
                $sort: {
                    distance: 1,
                    availableSlots: -1,
                },
            },
            {
                $limit: 1,
            },
            {
                $project: {
                    _id: 1,
                    store_name: 1,
                    store_address: 1,
                    location: 1,
                    distance: 1,
                    availableSlots: 1,
                    max_booking_capacity: 1,
                    booking_assigned_count: 1,
                    service_area_id: 1,
                },
            },
        ];

        const options = session ? { session } : {};
        const results = await Store.aggregate(pipeline).option(options);

        if (results.length === 0) {
            return { store: null, error: "NO_STORE" };
        }

        return { store: results[0], error: null };
    } catch (err) {
        console.error("Find nearest store error:", err);
        return { store: null, error: "SEARCH_FAILED" };
    }
};

export const assignStoreToBooking = async (storeId, session) => {
    try {
        const updatedStore = await Store.findOneAndUpdate(
            {
                _id: storeId,
                // $expr: {
                //     $lt: ["$booking_assigned_count", "$max_booking_capacity"],
                // },
            },
            {
                $inc: { booking_assigned_count: 1 },
            },
            {
                new: true,
                session,
            }
        ).lean();

        if (!updatedStore) {
            return { success: false, store: null };
        }

        return { success: true, store: updatedStore };
    } catch (err) {
        console.error("Assign store error:", err);
        return { success: false, store: null };
    }
};


// Invalidate User Booking Cache
export const invalidateBookingCache = async (userId, bookingId = null) => {
    try {
        const promises = [delByPattern(BOOKING_CACHE.LIST_PATTERN(userId))];
        if (bookingId) {
            promises.push(del(BOOKING_CACHE.DETAIL_KEY(userId, bookingId)));
        }
        await Promise.all(promises);
    } catch (err) {
        console.error("Booking cache invalidation error:", err);
    }
};

// Get cached data
export const getCachedData = async (cacheKey) => {
    try {
        const cached = await get(cacheKey);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error("Cache read error:", err);
        return null;
    }
};


// Set cache with TTL
export const setCacheData = async (cacheKey, data, ttl) => {
    try {
        await set(cacheKey, JSON.stringify(data), "EX", ttl);
    } catch (err) {
        console.error("Cache write error:", err);
    }
};

// Verify user exists, is active, and account is in good standing
export const verifyUserForBooking = async (userId, session = null) => {
    const query = User.findById(userId)
        .select("status is_active is_serviceable")
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

// Check if user's pickup location is serviceable
export const verifyServiceability = async (lat, lng) => {
    const result = await checkServiceability(lat, lng);
    return result;
};


// Check if user has reached max active bookings
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


// Validate that a scheduled time meets minimum lead time
export const validateScheduledTime = (scheduledAt, minLeadMinutes) => {
    const scheduledTime = new Date(scheduledAt);
    const minTime = new Date(Date.now() + minLeadMinutes * 60 * 1000);

    return {
        valid: scheduledTime >= minTime,
        scheduledTime,
    };
};

// Calculate total luggage count from luggage breakdown
export const calculateTotalLuggage = (luggage) => {
    const { small = 0, medium = 0, large = 0, other = 0 } = luggage;
    return small + medium + large + other;
};


// Find a booking owned by a specific user
export const findUserBooking = async (bookingId, userId, selectFields = "") => {
    return Booking.findOne({ _id: bookingId, userId })
        .select(selectFields)
        .lean();
};

// Find a mutable booking
export const findMutableUserBooking = async (bookingId, userId, selectFields = "") => {
    return Booking.findOne({ _id: bookingId, userId }).select(selectFields);
};

// Build pagination metadata
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

// Create a timeline entry
export const createTimelineEntry = (status, note, updatedBy = null, updatedByModel = null) => {
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

// Queue a booking-related job
export const queueBookingJob = (queueName, jobName, data, extraOptions = {}) => {
    const jobId = `${queueName}-${data.bookingId || Date.now()}`;

    addJobToQueue(
        queueName,
        { name: jobName, data },
        { jobId, ...DEFAULT_JOB_OPTIONS, ...extraOptions }
    ).catch((err) => console.error(`Failed to queue ${jobName}:`, err));
};

// Safely abort a transaction and end session
export const safeAbortSession = async (session) => {
    try {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
    } catch (_) {}
    session.endSession();
};