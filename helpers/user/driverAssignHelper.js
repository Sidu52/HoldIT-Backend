import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import Booking from "../../models/Booking.js";
import Store from "../../models/Store.js";
import { addJobToQueue } from "../../services/jobService.js";
import { ACCOUNT_STATUS, BOOKING_STATUS, JOB_QUEUES, VERIFICATION_STATUS } from "../../utils/constants.js";
import {
    DRIVER_ASSIGNMENT,
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    DRIVER_SEARCH_STATUSES,
    BOOKING_JOB_NAMES,
} from "../../constants/user/booking.js";
import { BookingKeys, BookingTTL } from "../../constants/redis/booking.keys.js";
import { DriverKeys, DriverTTL } from "../../constants/redis/driver.keys.js";
import logger from "../../utils/logger.js";

import {
    storeCandidates,
    popNextCandidate,
    getRemainingCandidateCount,
    markDriverTried,
    wasDriverTried,
    createDriverOffer,
    getOfferStatus,
    markOfferAccepted,
    clearOffer,
} from "../cache/driverOfferCache.js";

export {
    storeCandidates,
    popNextCandidate,
    getRemainingCandidateCount,
    markDriverTried,
    wasDriverTried,
    createDriverOffer,
    getOfferStatus,
    markOfferAccepted,
    clearOffer,
};

// SEARCH ACTIVE LOCK
export const markSearchActive = async (bookingId) => {
    const result = await redis.set(
        BookingKeys.searchActive(bookingId),
        "1",
        "EX",
        BookingTTL.SEARCH_ACTIVE,
        "NX"
    );
    return result === "OK";
};

export const clearSearchActive = async (bookingId) => {
    await redis.del(BookingKeys.searchActive(bookingId));
};

// REDIS CLEANUP
export const cleanupBookingRedisKeys = async (bookingId, knownDriverId = null) => {
    let driverIdToClean = knownDriverId;

    if (!driverIdToClean) {
        const { offer } = await getOfferStatus(bookingId);
        driverIdToClean = offer?.driverId ?? null;
    }

    const keys = [
        BookingKeys.offer(bookingId),
        BookingKeys.candidates(bookingId),
        BookingKeys.tried(bookingId),
        BookingKeys.searchActive(bookingId),
    ];

    if (driverIdToClean) {
        keys.push(DriverKeys.offered(driverIdToClean));
    }

    await Promise.allSettled(keys.map((k) => redis.del(k)));
};

// GEO SEARCH
export const getDriverGeoKeys = async (serviceAreaId) => {
    const keys = [];

    if (serviceAreaId) {
        keys.push(DriverKeys.geoByArea(serviceAreaId));
    }

    if (!keys.includes(DriverKeys.geoGlobal())) {
        keys.push(DriverKeys.geoGlobal());
    }

    return keys;
};

export const searchNearbyDrivers = async (geoKeys, lng, lat, bookingId, maxRadiusKm = null) => {
    let effectiveMaxRadius = maxRadiusKm;

    if (!effectiveMaxRadius) {
        try {
            const ServiceableArea = (await import("../../models/ServiceableArea.js")).default;
            const { checkServiceability } = await import("./addressHelper.js");
            const serviceability = await checkServiceability(lng, lat);
            if (serviceability.isServiceable && serviceability.serviceAreaId) {
                const area = await ServiceableArea.findById(serviceability.serviceAreaId).select("service_radius_km").lean();
                if (area?.service_radius_km) {
                    effectiveMaxRadius = area.service_radius_km;
                }
            }
        } catch (_) {}
    }

    effectiveMaxRadius = effectiveMaxRadius || 5;

    const radiiToSearch = [1, 3, effectiveMaxRadius]
        .filter((r, i, arr) => r <= effectiveMaxRadius && arr.indexOf(r) === i)
        .sort((a, b) => a - b);

    const allDrivers = [];
    const seenIds = new Set();

    if (Math.abs(lat) > 90) {
        logger.error(`[GeoSearch] lat/lng swapped — autocorrecting. lat=${lat}, lng=${lng}`);
        [lng, lat] = [lat, lng];
    }

    lng = parseFloat(lng);
    lat = parseFloat(lat);

    logger.info(`[GeoSearch] Starting search: lng=${lng}, lat=${lat}, bookingId=${bookingId}, maxRadius=${effectiveMaxRadius}km`);

    for (const radius of radiiToSearch) {
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
                logger.info(`[GeoSearch] key="${geoKey}" radius=${radius}km → ${results?.length || 0} result(s)`);
                if (!results?.length) continue;

                for (const result of results) {
                    const [driverId, distance, coords] = result;
                    if (!driverId || seenIds.has(driverId)) {
                        continue;
                    }
                    seenIds.add(driverId);

                    const meta = await redis.hgetall(DriverKeys.meta(driverId));
                    const tried = await wasDriverTried(bookingId, driverId);
                    const pendingOffer = await redis.get(DriverKeys.offered(driverId));
                    const eligible = await isDriverEligibleInRedis(driverId, bookingId);
                    if (!eligible) continue;

                    allDrivers.push({
                        driverId,
                        distanceKm: parseFloat(distance),
                    });
                }
            } catch (err) {
                logger.error(`[GeoSearch] ERROR key="${geoKey}" radius=${radius}km:`, err.message);
            }
        }

        if (allDrivers.length > 0) {
            logger.info(`[GeoSearch] Found ${allDrivers.length} driver(s) within ${radius}km`);
            break;
        }
        logger.info(`[GeoSearch] 0 drivers found within ${radius}km — expanding`);
    }

    logger.info(`[GeoSearch] Final result: ${allDrivers.length} driver(s)`);

    allDrivers.sort((a, b) => a.distanceKm - b.distanceKm);
    return allDrivers;
};

const isDriverEligibleInRedis = async (driverId, bookingId) => {
    try {
        const meta = await redis.hgetall(DriverKeys.meta(driverId));

        // No meta at all → let DB verification handle it later
        if (!meta || Object.keys(meta).length === 0) return true;

        // Explicitly on a trip → skip
        if (meta.is_on_trip === "true") return false;

        // If meta exists but is_online is NOT set (e.g. only updated_at exists
        // from a partial rebuild), treat as eligible — DB verification downstream
        // will do the final check. Only reject if is_online is explicitly "false".
        if (meta.is_online === "false") return false;

        const [tried, pendingOffer] = await Promise.all([
            wasDriverTried(bookingId, driverId),
            redis.get(DriverKeys.offered(driverId)),
        ]);

        if (tried) return false;
        if (pendingOffer && pendingOffer !== bookingId.toString()) return false;

        return true;
    } catch (err) {
        logger.warn(`[EligibilityCheck] Redis check failed for ${driverId}:`, err.message);
        return true;
    }
};

export const verifyDriversInDB = async (driverIds) => {
    if (!driverIds.length) return [];

    const drivers = await Driver.find({
        _id: { $in: driverIds },
        is_online: true,
        account_status: ACCOUNT_STATUS.ACTIVE,
        verification_status: VERIFICATION_STATUS.VERIFIED,
        $or: [
            { is_on_trip: false },
            { is_on_trip: { $exists: false } },
        ],
    })
        .select("_id first_name last_name account_status verification_status is_online is_on_trip")
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
        logger.warn("[Cleanup] Stale driver cleanup failed:", err.message);
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
        .select("status pickupLocation deliveryLocation criticalHandoverLocation serviceAreaId storeId pricing tipAmount luggage userId")
        .populate("storeId", "store_name location")
        .populate("userId", "first_name last_name phone")
        .lean();
};


export const handleReturnDriverNotFound = async (bookingId, reason) => {
    const now = new Date();
    const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: {
                status: BOOKING_STATUS.STORED,
                lastStatusUpdatedAt: now,
                "delivery.returnOtp": null, // Clear transient OTP
                "delivery.assignment": null, // Clear assignment attempt
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.STORED,
                    note: `Return driver search failed: ${reason}. You can retry requesting a return.`,
                    createdAt: now
                }
            },
        },
        { new: true }
    ).select("userId").lean();

    if (booking?.userId) {
        const userId = booking.userId.toString();

        // 1. Invalidate Cache
        const { invalidateBookingCache } = await import("./bookingHelper.js");
        await invalidateBookingCache(userId, bookingId).catch(() => { });

        // 2. Emit Socket Event
        try {
            const { getIO } = await import("../../src/socket/index.js");
            const { rooms } = await import("../../src/socket/socket.rooms.js");
            const { SOCKET_EVENTS } = await import("../../src/socket/socket.events.js");
            const io = getIO();

            io.to(rooms.user(userId)).emit(SOCKET_EVENTS.BOOKING_NO_DRIVER, {
                bookingId,
                status: BOOKING_STATUS.STORED,
                message: "No driver found for your return request. Please try again."
            });
        } catch (socketErr) {
            logger.debug(`[handleReturnDriverNotFound] Socket emission skipped: ${socketErr.message}`);
        }
    }

    return booking;
};

export const updateBookingStatus = async (bookingId, status, note) => {

    const now = new Date();
    const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: { status, lastStatusUpdatedAt: now },
            $push: { timeline: { status, note, createdAt: now } },
        },
        { new: true }
    ).select("userId").lean();

    if (booking?.userId) {
        const userId = booking.userId.toString();

        // 1. Invalidate Cache
        const { invalidateBookingCache } = await import("./bookingHelper.js");
        await invalidateBookingCache(userId, bookingId).catch((err) =>
            logger.warn(`[updateBookingStatus] Cache invalidation failed for ${bookingId}:`, err.message)
        );

        // 2. Emit Socket Event
        try {
            const { getIO } = await import("../../src/socket/index.js");
            const { rooms } = await import("../../src/socket/socket.rooms.js");
            const { SOCKET_EVENTS } = await import("../../src/socket/socket.events.js");
            const io = getIO();

            // Generic event (Legacy/Simpler)
            const payload = { bookingId, status, note };
            io.to(rooms.user(userId)).emit("booking:status_updated", payload);

            // Specific event (Recommended)
            const eventMap = {
                "driver_assigned": SOCKET_EVENTS.BOOKING_DRIVER_ASSIGNED,
                "driver_arrived": SOCKET_EVENTS.BOOKING_DRIVER_ARRIVED,
                "picked_up": SOCKET_EVENTS.BOOKING_PICKED_UP,
                "at_store": SOCKET_EVENTS.BOOKING_ARRIVED_AT_STORE,
                "stored": SOCKET_EVENTS.BOOKING_STORED,
                "return_requested": SOCKET_EVENTS.BOOKING_RETURN_REQUESTED,
                "return_driver_assigned": SOCKET_EVENTS.BOOKING_RETURN_DRIVER_ASSIGNED,
                "delivered": SOCKET_EVENTS.BOOKING_DELIVERED,
                "cancelled": SOCKET_EVENTS.BOOKING_CANCELLED,
                "driver_searching": SOCKET_EVENTS.BOOKING_DRIVER_SEARCHING,
            };

            const specificEvent = eventMap[status];
            if (specificEvent) {
                io.to(rooms.user(userId)).emit(specificEvent, payload);
            }

            logger.debug(`[Socket] Emitted status_updated and ${specificEvent || "none"} to ${userId}`);
        } catch (socketErr) {
            // Socket might not be initialized in some contexts (e.g. CLI tools)
            logger.debug(`[updateBookingStatus] Socket emission skipped: ${socketErr.message}`);
        }

        // Send Push Notification to User
        const titleMap = {
            "driver_assigned": "Driver Assigned 🛵",
            "driver_arrived": "Driver Arrived 📍",
            "picked_up": "Luggage Picked Up 🧳",
            "at_store": "Arrived at Storage Vault 🏬",
            "stored": "Luggage Securely Stored 🔒",
            "return_requested": "Return Delivery Requested 🔄",
            "return_driver_assigned": "Return Driver Assigned 🛵",
            "delivered": "Luggage Delivered 🎉",
            "cancelled": "Booking Cancelled ❌",
        };

        if (titleMap[status]) {
            import("../../services/NotificationService.js")
                .then(({ default: NotificationService }) => {
                    NotificationService.sendPushToUser(userId, {
                        title: titleMap[status],
                        body: note || `Your booking status is now: ${status}`,
                        data: {
                            screen: "tracking",
                            bookingId,
                            status,
                        },
                    });
                })
                .catch(() => {});
        }
    }

    return booking;
};

export const scheduleDriverSearch = async (bookingId, type = "PICKUP") => {
    await Promise.all([
        redis.del(BookingKeys.candidates(bookingId)),
        redis.del(BookingKeys.tried(bookingId)),
        redis.del(BookingKeys.searchActive(bookingId)),
    ]);

    // Always targets the real driver search/offer pipeline (DriverAssignWorker /
    // JOB_QUEUES.DRIVER_ASSIGN), regardless of type. type only controls which
    // location handleSearchDrivers reads (pickupLocation vs deliveryLocation).
    // RETURN_PROCESS routing lives exclusively in scheduleReturnProcessing now —
    // this function must never branch to JOB_QUEUES.RETURN_PROCESS again, or
    // you get exactly the infinite loop you just saw in the logs.
    await addJobToQueue(
        JOB_QUEUES.DRIVER_ASSIGN,
        { name: DRIVER_JOB_NAMES.SEARCH_DRIVERS, data: { bookingId, type } },
        {
            jobId: `search-drivers-${bookingId}-${type}-retry-${Date.now()}`,
            delay: 2000,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
        }
    );
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

export const checkDriverAvailability = async (serviceAreaId, lat, lng) => {
    try {
        let maxRadiusKm = 5;
        if (serviceAreaId) {
            const ServiceableArea = (await import("../../models/ServiceableArea.js")).default;
            const area = await ServiceableArea.findById(serviceAreaId).select("service_radius_km").lean();
            if (area?.service_radius_km) {
                maxRadiusKm = area.service_radius_km;
            }
        }

        const geoKeys = await getDriverGeoKeys(serviceAreaId);
        const nearbyDrivers = await searchNearbyDrivers(geoKeys, lng, lat, "PRE_PAYMENT_CHECK", maxRadiusKm);
        if (nearbyDrivers && nearbyDrivers.length > 0) {
            const driverIds = nearbyDrivers.map((d) => d.driverId);
            const verifiedDrivers = await verifyDriversInDB(driverIds);
            if (verifiedDrivers && verifiedDrivers.length > 0) {
                return true;
            }
        }

        const mongoDriver = await Driver.findOne({
            is_online: true,
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            $or: [{ is_on_trip: false }, { is_on_trip: { $exists: false } }],
            ...(serviceAreaId ? { service_area_id: serviceAreaId } : {}),
        }).lean();

        return !!mongoDriver;
    } catch (err) {
        logger.error(`[checkDriverAvailability] Error: ${err.message}`);
        return false;
    }
};

export const failDriverSearch = async (bookingId, type, reason) => {
    if (type === "PICKUP") {
        const { autoCancelBooking } = await import("./bookingHelper.js");
        return await autoCancelBooking(bookingId, reason || AUTO_CANCEL_REASONS.NO_DRIVER_FOUND);
    }

    const now = new Date();
    const existing = await Booking.findById(bookingId).select("status").lean();
    const currentStatus = existing?.status || BOOKING_STATUS.FINAL_PAYMENT_CAPTURED;

    const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
            $set: {
                lastStatusUpdatedAt: now,
                "delivery.returnOtp": null, // Clear transient OTP
                "delivery.assignment": null, // Clear assignment attempt
                "delivery.driverSearchStatus": "failed",
            },
            $push: {
                timeline: {
                    status: currentStatus,
                    note: `No driver found for ${type}: ${reason}. You can retry requesting return.`,
                    createdAt: now
                }
            },
        },
        { new: true }
    ).select("userId status").lean();

    if (booking?.userId) {
        const userId = booking.userId.toString();

        // 1. Invalidate Cache
        const { invalidateBookingCache } = await import("./bookingHelper.js");
        await invalidateBookingCache(userId, bookingId).catch(() => { });

        // 2. Emit Socket Event
        try {
            const { getIO } = await import("../../src/socket/index.js");
            const { rooms } = await import("../../src/socket/socket.rooms.js");
            const { SOCKET_EVENTS } = await import("../../src/socket/socket.events.js");
            const io = getIO();

            io.to(rooms.user(userId)).emit(SOCKET_EVENTS.BOOKING_NO_DRIVER, {
                bookingId,
                status: booking.status || BOOKING_STATUS.FINAL_PAYMENT_CAPTURED,
                message: "No driver found for your return request. Please try again."
            });
        } catch (socketErr) {
            logger.debug(`[handleReturnDriverNotFound] Socket emission skipped: ${socketErr.message}`);
        }
    }

    return booking;
};