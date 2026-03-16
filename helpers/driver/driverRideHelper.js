import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { markDriverOnTrip, markDriverAvailable } from "../../services/driverGeoService.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
import {
    DRIVER_RIDE_CACHE,
    DRIVER_VISIBLE_STATUSES,
    DRIVER_HISTORY_STATUSES,
} from "../../constants/driver/driver.ride.js";
import {
    clearOffer,
    markOfferAccepted,
    cleanupBookingRedisKeys,
    markDriverTried,
    scheduleOfferNextDriver,
} from "../user/driverAssignHelper.js";

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

// ========================
// QUERIES
// ========================

/**
 * Get all rides assigned to this driver (pickup or delivery)
 */
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

/**
 * Get active ride for driver (currently in progress)
 */
export const getDriverActiveRide = async (driverId, selectFields) => {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    return Booking.findOne({
        $or: [
            { "pickup.assignment.driverId": driverObjectId },
            { "delivery.assignment.driverId": driverObjectId },
        ],
        status: {
            $in: [
                BOOKING_STATUS.PICKUP_IN_PROGRESS,
                BOOKING_STATUS.RETURN_IN_PROGRESS,
            ],
        },
        isActive: true,
    })
        .select(selectFields)
        .populate("userId", "first_name last_name phone")
        .populate("storeId", "store_name store_address store_contact_number location")
        .lean();
};

/**
 * Find a ride that belongs to this driver
 */
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

/**
 * Find mutable ride for updates
 */
export const findMutableDriverRide = async (bookingId, driverId, selectFields = "") => {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    return Booking.findOne({
        _id: bookingId,
        $or: [
            { "pickup.assignment.driverId": driverObjectId },
            { "delivery.assignment.driverId": driverObjectId },
        ],
    }).select(selectFields);
};

/**
 * Get driver's completed ride history
 */
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

// ========================
// ACCEPT / REJECT
// ========================

/**
 * Handle driver accepting a ride offer
 * Atomic operation — first driver to accept wins
 */
export const processRideAccept = async (bookingId, driverId) => {
    const now = new Date();

    // Atomically assign — only succeeds if no driver assigned yet
    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.DRIVER_SEARCH,
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

    // Mark driver on trip in Redis + MongoDB
    await Promise.all([
        markDriverOnTrip(driverId, bookingId),
        Driver.findByIdAndUpdate(driverId, {
            $set: {
                is_on_trip: true,
                current_booking_id: bookingId,
            },
        }),
    ]);

    // Mark offer as accepted + cleanup Redis
    await markOfferAccepted(bookingId);
    await cleanupBookingRedisKeys(bookingId);

    return { success: true, booking };
};

/**
 * Handle driver rejecting a ride offer
 * Clear offer and trigger next driver
 */
export const processRideReject = async (bookingId, driverId) => {
    await clearOffer(bookingId, driverId);
    await markDriverTried(bookingId, driverId);

    // Trigger offer to next candidate
    await scheduleOfferNextDriver(bookingId, "PICKUP", Date.now());
};

// ========================
// PICKUP OPERATIONS
// ========================

/**
 * Start pickup — driver is heading to pickup location
 */
export const processStartPickup = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.DRIVER_ASSIGNED,
            "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
        },
        {
            $set: {
                status: BOOKING_STATUS.PICKUP_IN_PROGRESS,
                lastStatusUpdatedAt: now,
                "pickup.assignment.startedAt": now,
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.PICKUP_IN_PROGRESS,
                    note: "Driver started heading to pickup location",
                    updatedBy: new mongoose.Types.ObjectId(driverId),
                    updatedByModel: "Driver",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );
};

/**
 * Complete pickup — luggage collected, heading to store
 */
export const processCompletePickup = async (bookingId, driverId) => {
    const now = new Date();

    return Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.PICKUP_IN_PROGRESS,
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

// ========================
// PAGINATION
// ========================

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