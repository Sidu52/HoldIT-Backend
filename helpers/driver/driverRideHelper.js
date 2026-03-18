import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import redis, { get, set, del, delByPattern } from "../../services/redisService.js";
import { markDriverOnTrip, markDriverAvailable } from "../../services/driverGeoService.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
import {
    DRIVER_RIDE_CACHE,
    DRIVER_VISIBLE_STATUSES,
    DRIVER_HISTORY_STATUSES,
} from "../../constants/driver/driver.ride.js";
import {
    REDIS_KEYS,
} from "../../constants/user/booking.js";
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

// CACHE
export const getCachedData = async (cacheKey) => {
    try {
        const cached = await get(cacheKey);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error("Driver ride cache read error:", err);
        return null;
    }
};

export const setCacheData = async (cacheKey, data, ttl) => {
    try {
        await set(cacheKey, JSON.stringify(data), "EX", ttl);
    } catch (err) {
        console.error("Driver ride cache write error:", err);
    }
};

export const invalidateDriverRideCache = async (driverId, bookingId = null) => {
    try {
        const promises = [
            del(DRIVER_RIDE_CACHE.ASSIGNED_KEY(driverId)),
            del(DRIVER_RIDE_CACHE.ACTIVE_KEY(driverId)),
            delByPattern(`driver:ride_history:${driverId}:*`),
        ];
        if (bookingId) {
            promises.push(del(DRIVER_RIDE_CACHE.RIDE_DETAIL_KEY(driverId, bookingId)));
        }
        await Promise.all(promises);
    } catch (err) {
        console.error("Driver ride cache invalidation error:", err);
    }
};

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

    return Booking.findOne({
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
            ],
        },
        isActive: true,
    })
        .select(selectFields)
        .populate("userId", "first_name last_name phone")
        .populate("storeId", "store_name store_contact_number location")
        .lean();
};

export const findDriverRide = async (bookingId, driverId, selectFields = "") => {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    return Booking.findOne({
        _id: bookingId,
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

    const [rides, total] = await Promise.all([
        Booking.find(filter)
            .select("bookingCode status pickupLocation deliveryLocation luggage pricing payment.status createdAt cancelledAt cancelReason")
            .sort({ createdAt: sortDir })
            .skip(skip)
            .limit(limit)
            .lean(),
        Booking.countDocuments(filter),
    ]);

    return { rides, total };
};

// ACCEPT
export const processRideAccept = async (bookingId, driverId) => {
    const now = new Date();

    const booking = await Booking.findOneAndUpdate(
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
                    driverId: new mongoose.Types.ObjectId(driverId),
                    assignedAt: now,
                    acceptedAt: now,
                },
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.DRIVER_ASSIGNED,
                    note: "Driver accepted the ride",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

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
    await scheduleOfferNextDriver(bookingId, "PICKUP", attemptNumber + 1);
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
export const processCompletePickup = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.DRIVER_ARRIVED,
            "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
        },
        {
            $set: {
                status: BOOKING_STATUS.PICKED_UP,
                lastStatusUpdatedAt: now,
                "pickup.assignment.completedAt": now,
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

// CANCEL RIDE
// Statuses where cancellation is safe to re-search
const RESEARCHABLE_STATUSES = [
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED,
];

// Statuses where luggage is in custody — needs manual ops
const CRITICAL_STATUSES = [
    BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.AT_STORE,
];

export const processDriverCancelRide = async (bookingId, driverId, reason = "") => {
    const now = new Date();

    const booking = await Booking.findOne({
        _id: bookingId,
        "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
    }).select("status userId pickup.assignment").lean();

    if (!booking) {
        return { success: false, reason: "RIDE_NOT_FOUND" };
    }

    const { status } = booking;

    const isCritical = CRITICAL_STATUSES.includes(status);
    const isResearchable = RESEARCHABLE_STATUSES.includes(status);

    if (!isCritical && !isResearchable) {
        return { success: false, reason: "CANNOT_CANCEL_IN_STATUS" };
    }

    const nextStatus = isCritical
        ? BOOKING_STATUS.DRIVER_CANCELLED_CRITICAL  // flag for ops
        : BOOKING_STATUS.STORE_ASSIGNED;            // ready for re-search

    const updatedBooking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
            status: { $in: [...RESEARCHABLE_STATUSES, ...CRITICAL_STATUSES] },
        },
        {
            $set: {
                status: nextStatus,
                lastStatusUpdatedAt: now,
                "pickup.assignment.cancelledAt": now,
                "pickup.assignment.cancelReason": reason,
            },
            // ROOT CAUSE FIX: Must unset driverId so isBookingAwaitingDriver
            // no longer returns PICKUP_DRIVER_SET. Without this, scheduleDriverSearch
            // finds the booking, calls isBookingAwaitingDriver, sees
            // pickup.assignment.driverId is still set → awaiting=false →
            // search exits immediately → no new driver is ever found.
            $unset: {
                "pickup.assignment.driverId": "",
                "pickup.assignment.assignedAt": "",
                "pickup.assignment.acceptedAt": "",
                "pickup.assignment.startedAt": "",
            },
            $push: {
                timeline: {
                    status: nextStatus,
                    note: `Driver cancelled: ${reason || "no reason given"}`,
                    updatedBy: new mongoose.Types.ObjectId(driverId),
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

    // ── Step 1: Free the driver in MongoDB + Redis meta SEQUENTIALLY ──────────
    // RACE CONDITION FIX: Previously these ran concurrently in Promise.allSettled:
    //   markDriverAvailable(driverId)          → hset is_on_trip:false
    //   redis.del(DRIVER_META(driverId))        → del the same key
    // If del won the race it wiped the meta that markDriverAvailable just wrote,
    // leaving the driver with no meta. The next geo search's isDriverEligibleInRedis
    // would see empty meta (passes through), but verifyDriversInDB would still
    // see is_on_trip:true in MongoDB (DB update also ran concurrently and might
    // not have committed yet) → driver rejected → 0 verified candidates →
    // booking auto-cancelled before driver ever saw the new offer.
    //
    // Fix: await the MongoDB + Redis meta updates FIRST (sequentially), THEN
    // clean up offer/cache keys, THEN schedule the new search.
    // Never delete DRIVER_META during a cancel — only removeDriverFromRedis
    // (called when driver goes offline) should delete it. During a cancel
    // we just update the meta fields, we don't wipe the whole key.
    await Promise.all([
        // Update MongoDB first — verifyDriversInDB reads this
        Driver.findByIdAndUpdate(driverId, {
            $set: { is_on_trip: false, current_booking_id: null },
            $inc: { cancel_count: 1 },
        }),
        // Update Redis meta — isDriverEligibleInRedis reads this
        // DO NOT del DRIVER_META here: that would race with this hset
        // and leave the driver invisible to eligibility checks
        markDriverAvailable(driverId),
    ]);

    // ── Step 2: Clean up offer/lock/cache keys (non-fatal) ───────────────────
    await Promise.allSettled([
        redis.del(REDIS_KEYS.DRIVER_OFFERED(driverId)),
        redis.del(REDIS_KEYS.BOOKING_OFFER(bookingId)),
        invalidateDriverRideCache(driverId, bookingId),
        invalidateBookingCache(updatedBooking.userId.toString(), bookingId),
    ]);

    if (isCritical) {
        await flagCriticalCancellation(bookingId, driverId, status, reason);
        return {
            success: true,
            action: "CRITICAL_FLAGGED",
            bookingId,
        };
    }

    // ── Step 3: Schedule new search AFTER driver is fully freed ──────────────
    // The search worker calls verifyDriversInDB immediately. If we scheduled
    // before Step 1 committed, it would see is_on_trip:true and reject the
    // driver, auto-cancelling the booking with 0 verified candidates.
    await scheduleDriverSearch(bookingId, "PICKUP");

    return {
        success: true,
        action: "DRIVER_RELEASED_SEARCHING",
        bookingId,
    };
};

async function flagCriticalCancellation(bookingId, driverId, status, reason) {
    await redis.hset(`ops:critical_cancellation:${bookingId}`, {
        driverId,
        status,
        reason,
        flaggedAt: Date.now(),
    });
    await redis.expire(`ops:critical_cancellation:${bookingId}`, 60 * 60 * 24);

    console.error(
        `[CRITICAL] Driver ${driverId} cancelled booking ${bookingId} with luggage in custody. Status: ${status}`
    );
}

// PAGINATION
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