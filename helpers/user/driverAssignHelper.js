import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import Booking from "../../models/Booking.js";
import Store from "../../models/Store.js";
import { addJobToQueue } from "../../services/jobService.js";
import { ACCOUNT_STATUS, BOOKING_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";
import {
    DRIVER_ASSIGNMENT,
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    DRIVER_SEARCH_STATUSES,
    REDIS_KEYS,
    REDIS_TTL,
} from "../../constants/user/booking.js";

// CANDIDATE PIPELINE
export const storeCandidates = async (bookingId, driverIds) => {
    if (!driverIds.length) return 0;

    const key = REDIS_KEYS.BOOKING_CANDIDATES(bookingId);
    const pipeline = redis.pipeline();
    pipeline.del(key);
    pipeline.rpush(key, ...driverIds);
    pipeline.expire(key, REDIS_TTL.CANDIDATES);
    await pipeline.exec();

    return driverIds.length;
};

export const popNextCandidate = async (bookingId) => {
    return redis.lpop(REDIS_KEYS.BOOKING_CANDIDATES(bookingId));
};

export const getRemainingCandidateCount = async (bookingId) => {
    return redis.llen(REDIS_KEYS.BOOKING_CANDIDATES(bookingId));
};

// TRIED-DRIVERS SET
export const markDriverTried = async (bookingId, driverId) => {
    const key = REDIS_KEYS.BOOKING_TRIED(bookingId);
    const pipeline = redis.pipeline();
    pipeline.sadd(key, driverId.toString());
    pipeline.expire(key, REDIS_TTL.TRIED_DRIVERS);
    await pipeline.exec();
};

export const wasDriverTried = async (bookingId, driverId) => {
    const result = await redis.sismember(
        REDIS_KEYS.BOOKING_TRIED(bookingId),
        driverId.toString()
    );
    return result === 1;
};

// OFFER STATE
export const createDriverOffer = async (bookingId, driverId, attemptNumber = 1) => {
    const offerKey = REDIS_KEYS.BOOKING_OFFER(bookingId);
    const driverLockKey = REDIS_KEYS.DRIVER_OFFERED(driverId);

    const existingLock = await redis.get(driverLockKey);
    if (existingLock) {
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
        attemptNumber: attemptNumber.toString(),
    });
    pipeline.expire(offerKey, REDIS_TTL.OFFER);
    pipeline.set(driverLockKey, bookingId.toString(), "EX", REDIS_TTL.DRIVER_OFFERED);
    await pipeline.exec();

    return { created: true, reason: null };
};

export const getOfferStatus = async (bookingId) => {
    const offer = await redis.hgetall(REDIS_KEYS.BOOKING_OFFER(bookingId));
    if (!offer || !offer.driverId) return { exists: false, offer: null };
    return { exists: true, offer };
};

export const markOfferAccepted = async (bookingId) => {
    await redis.hset(REDIS_KEYS.BOOKING_OFFER(bookingId), "status", "accepted");
};

export const clearOffer = async (bookingId, driverId) => {
    await Promise.all([
        redis.del(REDIS_KEYS.BOOKING_OFFER(bookingId)),
        redis.del(REDIS_KEYS.DRIVER_OFFERED(driverId)),
    ]);
};

// SEARCH ACTIVE LOCK
export const markSearchActive = async (bookingId) => {
    const result = await redis.set(
        REDIS_KEYS.BOOKING_SEARCH_ACTIVE(bookingId),
        "1",
        "EX",
        REDIS_TTL.SEARCH_ACTIVE,
        "NX"
    );
    return result === "OK";
};

export const clearSearchActive = async (bookingId) => {
    await redis.del(REDIS_KEYS.BOOKING_SEARCH_ACTIVE(bookingId));
};

// REDIS CLEANUP
export const cleanupBookingRedisKeys = async (bookingId, knownDriverId = null) => {
    let driverIdToClean = knownDriverId;

    if (!driverIdToClean) {
        const { offer } = await getOfferStatus(bookingId);
        driverIdToClean = offer?.driverId ?? null;
    }

    const keys = [
        REDIS_KEYS.BOOKING_OFFER(bookingId),
        REDIS_KEYS.BOOKING_CANDIDATES(bookingId),
        REDIS_KEYS.BOOKING_TRIED(bookingId),
        REDIS_KEYS.BOOKING_SEARCH_ACTIVE(bookingId),
    ];

    if (driverIdToClean) {
        keys.push(REDIS_KEYS.DRIVER_OFFERED(driverIdToClean));
    }

    await Promise.allSettled(keys.map((k) => redis.del(k)));
};

// GEO SEARCH
export const getDriverGeoKeys = async (serviceAreaId) => {
    const keys = [];

    if (serviceAreaId) {
        keys.push(REDIS_KEYS.DRIVER_GEO(serviceAreaId));
    }

    if (!keys.includes(REDIS_KEYS.DRIVER_GEO_GLOBAL)) {
        keys.push(REDIS_KEYS.DRIVER_GEO_GLOBAL);
    }

    return keys;
};

export const searchNearbyDrivers = async (geoKeys, lng, lat, bookingId) => {
    const allDrivers = [];
    const seenIds = new Set();

    if (Math.abs(lat) > 90) {
        console.error(`[GeoSearch] lat/lng swapped — autocorrecting. lat=${lat}, lng=${lng}`);
        [lng, lat] = [lat, lng];
    }

    lng = parseFloat(lng);
    lat = parseFloat(lat);

    // console.log(`\n[GeoSearch] ═══════════════════════════════`);
    // console.log(`[GeoSearch] bookingId : ${bookingId}`);
    // console.log(`[GeoSearch] lng=${lng}, lat=${lat}`);
    // console.log(`[GeoSearch] geoKeys   : ${JSON.stringify(geoKeys)}`);
    // console.log(`[GeoSearch] radii     : ${JSON.stringify(DRIVER_ASSIGNMENT.SEARCH_RADII_KM)}`);

    for (const radius of DRIVER_ASSIGNMENT.SEARCH_RADII_KM) {
        // console.log(`\n[GeoSearch] ── Trying radius ${radius}km ──`);
        for (const geoKey of geoKeys) {
            try {
                const keyExists = await redis.exists(geoKey);
                if (!keyExists) continue;

                const results = await redis.call(
                    "GEORADIUS",
                    geoKey,
                    lng.toFixed(6),
                    lat.toFixed(6),
                    radius.toString(),
                    "km",
                    "WITHDIST",
                    "WITHCOORD",
                    "ASC",
                    "COUNT",
                    DRIVER_ASSIGNMENT.MAX_CANDIDATES_PER_SEARCH.toString()
                );

                if (!results?.length) continue;

                for (const result of results) {
                    const [driverId, distance] = result;
                    if (!driverId || seenIds.has(driverId)) continue;
                    seenIds.add(driverId);

                    const eligible = await isDriverEligibleInRedis(driverId, bookingId);
                    if (!eligible) continue;

                    allDrivers.push({
                        driverId,
                        distanceKm: parseFloat(distance),
                    });
                }
            } catch (err) {
                console.error(`[GeoSearch] ERROR key="${geoKey}" radius=${radius}km:`, err.message);
            }
        }

        if (allDrivers.length > 0) {
            // console.log(`[GeoSearch] Found ${allDrivers.length} driver(s) within ${radius}km`);
            break;
        }

        // console.log(`[GeoSearch] 0 drivers found within ${radius}km — expanding`);
    }

    // console.log(`[GeoSearch] Final result: ${allDrivers.length} driver(s)`);
    // console.log(`[GeoSearch] ═══════════════════════════════\n`);

    allDrivers.sort((a, b) => a.distanceKm - b.distanceKm);
    return allDrivers;
};

const isDriverEligibleInRedis = async (driverId, bookingId) => {
    try {
        const meta = await redis.hgetall(REDIS_KEYS.DRIVER_META(driverId));

        if (!meta || Object.keys(meta).length === 0) return true;

        if (meta.is_on_trip === "true") return false;
        if (meta.is_online !== "true") return false;

        const [tried, pendingOffer] = await Promise.all([
            wasDriverTried(bookingId, driverId),
            redis.get(REDIS_KEYS.DRIVER_OFFERED(driverId)),
        ]);

        if (tried) return false;
        if (pendingOffer && pendingOffer !== bookingId.toString()) return false;

        return true;
    } catch (err) {
        console.warn(`[EligibilityCheck] Redis check failed for ${driverId}:`, err.message);
        return true;
    }
};

export const verifyDriversInDB = async (driverIds) => {
    if (!driverIds.length) return [];

    const drivers = await Driver.find({
        _id: { $in: driverIds },
        is_active: true,
        is_online: true,
        status: ACCOUNT_STATUS.ACTIVE,
        verification_status: VERIFICATION_STATUS.VERIFIED,
        $or: [
            { is_on_trip: false },
            { is_on_trip: { $exists: false } },
        ],
    })
        .select("_id first_name last_name status verification_status is_active is_online is_on_trip")
        .lean();

    return drivers;
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
    } catch (err) {
        console.warn("[Cleanup] Stale driver cleanup failed:", err.message);
    }
};

// BOOKING STATE CHECKS
export const isBookingAwaitingDriver = async (bookingId) => {
    const booking = await Booking.findById(bookingId)
        .select("status pickup.assignment.driverId delivery.assignment.driverId")
        .lean();

    if (!booking)
        return { awaiting: false, reason: "NOT_FOUND" };

    if (booking.status === BOOKING_STATUS.CANCELLED)
        return { awaiting: false, reason: "CANCELLED" };

    if (booking.status === BOOKING_STATUS.DRIVER_ASSIGNED)
        return { awaiting: false, reason: "ALREADY_ASSIGNED" };

    if (booking.status === BOOKING_STATUS.RETURN_DRIVER_ASSIGNED)
        return { awaiting: false, reason: "ALREADY_ASSIGNED" };

    if (DRIVER_SEARCH_STATUSES.includes(booking.status))
        return { awaiting: true, reason: null };

    return { awaiting: false, reason: "INVALID_STATUS" };
};

export const getBookingForDriverSearch = async (bookingId) => {
    return Booking.findById(bookingId)
        .select("status pickupLocation deliveryLocation serviceAreaId storeId")
        .lean();
};

export const updateBookingStatus = async (bookingId, status, note) => {
    const now = new Date();
    return Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: { status, lastStatusUpdatedAt: now },
            $push: { timeline: { status, note, createdAt: now } },
        },
        { new: true }
    );
};

export const scheduleDriverSearch = async (bookingId, type = "PICKUP") => {
    // Clear stale search state so the new search starts clean
    await Promise.all([
        redis.del(REDIS_KEYS.BOOKING_CANDIDATES(bookingId)),
        redis.del(REDIS_KEYS.BOOKING_TRIED(bookingId)),
        redis.del(REDIS_KEYS.BOOKING_SEARCH_ACTIVE(bookingId)),
    ]);

    await addJobToQueue(
        DRIVER_ASSIGN_QUEUE,
        {
            name: DRIVER_JOB_NAMES.SEARCH_DRIVERS,
            data: { bookingId, type },
        },
        {
            jobId: `search-drivers-${bookingId}-retry-${Date.now()}`,
            delay: 2000,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
        }
    );
};

export const autoCancelBooking = async (bookingId, reason) => {
    try {
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
                    timeline: {
                        status: BOOKING_STATUS.CANCELLED,
                        note: `Auto-cancelled: ${reason}`,
                        createdAt: now,
                    },
                },
            },
            { new: true, select: "_id storeId status" }
        );

        if (!booking) {
            console.log(`[AutoCancel] Booking ${bookingId} already in terminal state`);
            return { success: false };
        }

        if (booking.storeId) {
            await Store.findOneAndUpdate(
                { _id: booking.storeId, current_booking_count: { $gt: 0 } },
                { $inc: { current_booking_count: -1 } }
            );
        }

        await cleanupBookingRedisKeys(bookingId);

        console.log(`[AutoCancel] Booking ${bookingId} cancelled — reason: ${reason}`);
        return { success: true, booking };
    } catch (err) {
        console.error(`[AutoCancel] Failed for ${bookingId}:`, err.message);
        return { success: false };
    }
};

// JOB SCHEDULERS
export const scheduleOfferNextDriver = async (bookingId, type, attemptNumber, delay = 0) => {
    return addJobToQueue(
        DRIVER_ASSIGN_QUEUE,
        {
            name: DRIVER_JOB_NAMES.OFFER_NEXT_DRIVER,
            data: { bookingId, type, attemptNumber },
        },
        {
            jobId: `offer-${bookingId}-${attemptNumber}`,
            delay,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
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
            delay: DRIVER_ASSIGNMENT.OFFER_CHECK_DELAY_SECONDS * 1000,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
        }
    );
};

// UTILS
export const getDriverName = (driver) => {
    if (!driver) return "Unknown";
    return `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || "Unknown";
};