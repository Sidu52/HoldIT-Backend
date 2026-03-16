import mongoose from "mongoose";
import redis, { scanKeys } from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import Booking from "../../models/Booking.js";
import Store from "../../models/Store.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
import { addJobToQueue } from "../../services/jobService.js";
import {
    DRIVER_ASSIGNMENT,
    REDIS_KEYS,
    REDIS_TTL,
    AUTO_CANCEL_REASONS,
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    DRIVER_SEARCH_STATUSES,
} from "../../constants/user/booking.js";

export const storeCandidates = async (bookingId, driverIds) => {
    const key = REDIS_KEYS.BOOKING_CANDIDATES(bookingId);

    if (!driverIds.length) return 0;

    await redis.del(key);
    await redis.rpush(key, ...driverIds);
    await redis.expire(key, REDIS_TTL.CANDIDATES);

    return driverIds.length;
};

export const popNextCandidate = async (bookingId) => {
    const key = REDIS_KEYS.BOOKING_CANDIDATES(bookingId);
    return redis.lpop(key);
};

export const getRemainingCandidateCount = async (bookingId) => {
    const key = REDIS_KEYS.BOOKING_CANDIDATES(bookingId);
    return redis.llen(key);
};

export const markDriverTried = async (bookingId, driverId) => {
    const key = REDIS_KEYS.BOOKING_TRIED(bookingId);
    await redis.sadd(key, driverId.toString());
    await redis.expire(key, REDIS_TTL.TRIED_DRIVERS);
};

export const wasDriverTried = async (bookingId, driverId) => {
    const key = REDIS_KEYS.BOOKING_TRIED(bookingId);
    const result = await redis.sismember(key, driverId.toString());
    return result === 1;
};

export const getTriedDrivers = async (bookingId) => {
    const key = REDIS_KEYS.BOOKING_TRIED(bookingId);
    return redis.smembers(key);
};

export const createDriverOffer = async (bookingId, driverId) => {
    const offerKey = REDIS_KEYS.BOOKING_OFFER(bookingId);
    const driverLockKey = REDIS_KEYS.DRIVER_OFFERED(driverId);
    const existingOffer = await redis.get(driverLockKey);
    if (existingOffer) {
        return { created: false, reason: "DRIVER_HAS_PENDING_OFFER" };
    }

    const currentOffer = await redis.hgetall(offerKey);
    if (currentOffer?.driverId && currentOffer?.status === "pending") {
        return { created: false, reason: "BOOKING_HAS_ACTIVE_OFFER" };
    }

    const pipeline = redis.pipeline();

    pipeline.hset(offerKey, {
        driverId: driverId.toString(),
        offeredAt: Date.now().toString(),
        status: "pending",
    });
    pipeline.expire(offerKey, REDIS_TTL.OFFER);

    pipeline.set(
        driverLockKey,
        bookingId.toString(),
        "EX",
        REDIS_TTL.DRIVER_OFFERED
    );

    await pipeline.exec();

    return { created: true, reason: null };
};

export const getOfferStatus = async (bookingId) => {
    const offerKey = REDIS_KEYS.BOOKING_OFFER(bookingId);
    const offer = await redis.hgetall(offerKey);
    if (!offer || !offer.driverId) {
        return { exists: false, offer: null };
    }

    return { exists: true, offer };
};


export const markOfferAccepted = async (bookingId) => {
    const offerKey = REDIS_KEYS.BOOKING_OFFER(bookingId);
    await redis.hset(offerKey, "status", "accepted");
};


export const clearOffer = async (bookingId, driverId) => {
    const offerKey = REDIS_KEYS.BOOKING_OFFER(bookingId);
    const driverLockKey = REDIS_KEYS.DRIVER_OFFERED(driverId);

    await Promise.all([
        redis.del(offerKey),
        redis.del(driverLockKey),
    ]);
};

export const cleanupBookingRedisKeys = async (bookingId) => {
    const { offer } = await getOfferStatus(bookingId);

    const keysToDelete = [
        REDIS_KEYS.BOOKING_OFFER(bookingId),
        REDIS_KEYS.BOOKING_CANDIDATES(bookingId),
        REDIS_KEYS.BOOKING_TRIED(bookingId),
        REDIS_KEYS.BOOKING_DRIVER_SEARCH_ACTIVE(bookingId),
    ];

    // Also clean driver's offer lock if exists
    if (offer?.driverId) {
        keysToDelete.push(REDIS_KEYS.DRIVER_OFFERED(offer.driverId));
    }

    await Promise.all(keysToDelete.map((k) => redis.del(k).catch(() => {})));
};


export const markSearchActive = async (bookingId) => {
    const key = REDIS_KEYS.BOOKING_DRIVER_SEARCH_ACTIVE(bookingId);
    const result = await redis.set(key, "1", "EX", REDIS_TTL.DRIVER_SEARCH_ACTIVE, "NX");
    return result === "OK";
};

export const isSearchActive = async (bookingId) => {
    const key = REDIS_KEYS.BOOKING_DRIVER_SEARCH_ACTIVE(bookingId);
    const result = await redis.get(key);
    return result === "1";
};

export const clearSearchActive = async (bookingId) => {
    const key = REDIS_KEYS.BOOKING_DRIVER_SEARCH_ACTIVE(bookingId);
    await redis.del(key);
};

export const getDriverGeoKeys = async (serviceAreaId) => {
    const keysToSearch = [];

    // Booking's service area
    if (serviceAreaId) {
        keysToSearch.push(REDIS_KEYS.DRIVER_GEO(serviceAreaId));
    }

    // All other areas
    try {
        const { keys: allKeys } = await scanKeys("drivers:*");
        for (const key of allKeys) {
            if (key.includes("meta")) continue;
            if (!keysToSearch.includes(key)) {
                keysToSearch.push(key);
            }
        }
    } catch (err) {
        console.warn("[GeoKeys] Scan failed:", err.message);
    }

    // Global
    if (!keysToSearch.includes(REDIS_KEYS.DRIVER_GEO_GLOBAL)) {
        keysToSearch.push(REDIS_KEYS.DRIVER_GEO_GLOBAL);
    }

    return keysToSearch;
};

export const searchNearbyDrivers = async (geoKeys, lng, lat, bookingId) => {
    const allDrivers = [];
    const seenIds = new Set();

    for (const radius of DRIVER_ASSIGNMENT.SEARCH_RADII_KM) {
        for (const geoKey of geoKeys) {
            try {
                const exists = await redis.exists(geoKey);
                if (!exists) continue;

                const results = await redis.georadius(
                    geoKey,
                    lng,
                    lat,
                    radius,
                    "km",
                    "WITHCOORD",
                    "WITHDIST",
                    "ASC",
                    "COUNT",
                    DRIVER_ASSIGNMENT.MAX_CANDIDATES_PER_SEARCH
                );

                if (!results?.length) continue;

                for (const [driverId, distance] of results) {
                    if (seenIds.has(driverId)) continue;
                    seenIds.add(driverId);
                    const eligible = await isDriverEligibleInRedis(
                        driverId,
                        bookingId
                    );
                    if (!eligible) continue;

                    allDrivers.push({
                        driverId,
                        distanceKm: parseFloat(distance),
                        name: "",
                    });
                }
            } catch (err) {
                console.warn(`[GeoSearch] Failed for ${geoKey}:`, err.message);
            }
        }

        if (allDrivers.length > 0) {
            console.log(
                `[GeoSearch] Found ${allDrivers.length} drivers within ${radius}km`
            );
            break;
        }
    }

    // Sort by distance
    allDrivers.sort((a, b) => a.distanceKm - b.distanceKm);

    return allDrivers;
};

const isDriverEligibleInRedis = async (driverId, bookingId) => {
    try {
        const metaKey = REDIS_KEYS.DRIVER_META(driverId);
        const meta = await redis.hgetall(metaKey);
        if (!meta || Object.keys(meta).length === 0) return true;

        // Driver is on a trip
        if (meta.is_on_trip === "true") return false;

        // Driver is offline
        if (meta.is_online !== "true") return false;

        // Driver already tried for this booking
        const tried = await wasDriverTried(bookingId, driverId);
        if (tried) return false;

        // Driver has a pending offer from another booking
        const driverLockKey = REDIS_KEYS.DRIVER_OFFERED(driverId);
        const pendingOffer = await redis.get(driverLockKey);
        if (pendingOffer && pendingOffer !== bookingId) return false;

        return true;
    } catch (err) {
        console.warn(`[EligibilityCheck] Redis check failed for ${driverId}:`, err.message);
        return true; // Let MongoDB be the final authority
    }
};

export const verifyDriversInDB = async (driverIds) => {
    if (!driverIds.length) return [];

    return Driver.find({
        _id: { $in: driverIds },
        is_active: true,
        is_online: true,
        status: "approved",
        verification_status: "success",
        $or: [
            { is_on_trip: false },
            { is_on_trip: { $exists: false } },
        ],
    })
        .select("_id first_name last_name phone vehicle_type")
        .lean();
};

export const cleanStaleDrivers = async (geoKeys, staleDriverIds) => {
    if (!staleDriverIds.length) return;

    const pipeline = redis.pipeline();

    for (const geoKey of geoKeys) {
        for (const id of staleDriverIds) {
            pipeline.zrem(geoKey, id.toString());
        }
    }

    try {
        await pipeline.exec();
        console.log(`[Cleanup] Removed ${staleDriverIds.length} stale drivers from Redis`);
    } catch (err) {
        console.warn("[Cleanup] Stale driver cleanup failed:", err.message);
    }
};

export const isBookingAwaitingDriver = async (bookingId) => {
    const booking = await Booking.findById(bookingId)
        .select("status pickup.assignment.driverId delivery.assignment.driverId")
        .lean();

    if (!booking) return { awaiting: false, reason: "NOT_FOUND" };

    if (booking.status === BOOKING_STATUS.CANCELLED) {
        return { awaiting: false, reason: "CANCELLED" };
    }

    if (booking.status === BOOKING_STATUS.DRIVER_ASSIGNED) {
        return { awaiting: false, reason: "ALREADY_ASSIGNED" };
    }

    if (booking.pickup?.assignment?.driverId) {
        return { awaiting: false, reason: "PICKUP_DRIVER_SET" };
    }

    if (booking.delivery?.assignment?.driverId) {
        return { awaiting: false, reason: "DELIVERY_DRIVER_SET" };
    }

    if (DRIVER_SEARCH_STATUSES.includes(booking.status)) {
        return { awaiting: true, reason: null };
    }

    return { awaiting: false, reason: "INVALID_STATUS" };
};

export const getBookingForDriverSearch = async (bookingId) => {
    return Booking.findById(bookingId)
        .select("status pickupLocation deliveryLocation serviceAreaId storeId")
        .lean();
};

export const updateBookingStatus = async (bookingId, status, note) => {
    return Booking.findByIdAndUpdate(bookingId, {
        $set: {
            status,
            lastStatusUpdatedAt: new Date(),
        },
        $push: {
            timeline: {
                status,
                note,
                createdAt: new Date(),
            },
        },
    });
};

export const autoCancelBooking = async (bookingId, reason) => {
    try {
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
                    cancelledAt: new Date(),
                    cancelledBy: "SYSTEM",
                    cancelReason: reason,
                    lastStatusUpdatedAt: new Date(),
                },
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.CANCELLED,
                        note: `Auto-cancelled: ${reason}`,
                        createdAt: new Date(),
                    },
                },
            },
            { returnDocument: "after" }
        );

        if (!booking) {
            console.log(`[AutoCancel] Booking ${bookingId} already handled`);
            return { success: false };
        }

        if (booking.storeId) {
            await Store.findOneAndUpdate(
                { _id: booking.storeId, booking_assigned_count: { $gt: 0 } },
                { $inc: { booking_assigned_count: -1 } }
            );
        }
        await cleanupBookingRedisKeys(bookingId);

        console.log(`[AutoCancel] Booking ${bookingId} cancelled: ${reason}`);
        return { success: true, booking };
    } catch (err) {
        console.error(`[AutoCancel] Failed for ${bookingId}:`, err);
        return { success: false };
    }
};

export const scheduleOfferNextDriver = async (bookingId, type, attemptNumber, delay = 0) => {
    return addJobToQueue(
        DRIVER_ASSIGN_QUEUE,
        {
            name: DRIVER_JOB_NAMES.OFFER_NEXT_DRIVER,
            data: { bookingId, type, attemptNumber },
        },
        {
            jobId: `offer-${bookingId}-${attemptNumber}`,
            removeOnComplete: true,
            delay,
        }
    );
};

export const scheduleOfferTimeoutCheck = async (bookingId, type, driverId, attemptNumber) => {
    return addJobToQueue(
        DRIVER_ASSIGN_QUEUE,
        {
            name: DRIVER_JOB_NAMES.CHECK_OFFER_TIMEOUT,
            data: { bookingId, type, driverId, attemptNumber },
        },
        {
            jobId: `timeout-${bookingId}-${attemptNumber}`,
            removeOnComplete: true,
            delay: DRIVER_ASSIGNMENT.OFFER_CHECK_DELAY_SECONDS * 1000,
        }
    );
};

export const getDriverName = (driver) => {
    if (!driver) return "Unknown";
    return `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || "Unknown";
};