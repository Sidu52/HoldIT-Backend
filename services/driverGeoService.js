import redis from "./redisService.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";
import logger from "../utils/logger.js";

// ADD
export const addDriverToRedis = async (driver) => {
    if (!driver?._id) {
        logger.warn("[DriverGeo] addDriverToRedis: missing driver or _id");
        return false;
    }

    // Must be driver active, online, verified, not on a trip
    if (
        !driver.is_online ||
        driver.is_on_trip ||
        driver.account_status !== ACCOUNT_STATUS.ACTIVE ||
        driver.verification_status !== VERIFICATION_STATUS.VERIFIED
    ) {
        // Silently remove from Redis if driver stage no longer qualifies
        await removeDriverFromRedis(driver._id, driver.service_area_id).catch(() => { });
        return false;
    }

    // Validate coordinates
    if (
        !driver.currentLocation?.coordinates ||
        !Array.isArray(driver.currentLocation.coordinates) ||
        driver.currentLocation.coordinates.length < 2
    ) {
        logger.warn(`[DriverGeo] Driver ${driver._id} has no valid coordinates`);
        return false;
    }

    const [lng, lat] = driver.currentLocation.coordinates;

    if (
        typeof lng !== "number" || typeof lat !== "number" ||
        lng < -180 || lng > 180 ||
        lat < -90 || lat > 90
    ) {
        logger.warn(
            `[DriverGeo] Driver ${driver._id} has invalid coordinates [${lng}, ${lat}]`
        );
        return false;
    }

    const driverId = driver._id.toString();

    try {
        const pipeline = redis.pipeline();

        // Write to service area key if present
        if (driver.service_area_id) {
            pipeline.geoadd(
                `drivers:${driver.service_area_id.toString()}`,
                lng, lat, driverId
            );
        }

        // Always write to global fallback
        pipeline.geoadd("drivers:global", lng, lat, driverId);

        // Driver metadata hash (used for fast eligibility checks)
        pipeline.hset(`driver:meta:${driverId}`, {
            is_online: "true",
            is_on_trip: "false",
            vehicle_type: driver.vehicle_type ?? "scooter",
            service_area_id: driver.service_area_id?.toString() ?? "",
            updated_at: Date.now().toString(),
        });

        // Meta expires after 1 hour  driver must ping/update to stay active
        pipeline.expire(`driver:meta:${driverId}`, 3600);

        await pipeline.exec();

        logger.info(`[DriverGeo] Driver ${driverId} added at [${lng}, ${lat}]`);
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] addDriverToRedis failed for ${driverId}:`, err.message);
        return false;
    }
};

// REMOVE
export const removeDriverFromRedis = async (driverId, serviceAreaId = null) => {
    if (!driverId) {
        logger.warn("[DriverGeo] removeDriverFromRedis: missing driverId");
        return false;
    }

    const driverIdStr = driverId.toString();

    try {
        const pipeline = redis.pipeline();

        if (serviceAreaId) {
            pipeline.zrem(`drivers:${serviceAreaId.toString()}`, driverIdStr);
        } else {
            // Look up service area from meta if not provided
            const areaId = await redis.hget(`driver:meta:${driverIdStr}`, "service_area_id");
            if (areaId) {
                pipeline.zrem(`drivers:${areaId}`, driverIdStr);
            }
        }

        // Always remove from global
        pipeline.zrem("drivers:global", driverIdStr);

        // Remove metadata
        pipeline.del(`driver:meta:${driverIdStr}`);

        await pipeline.exec();

        logger.info(`[DriverGeo] Driver ${driverIdStr} removed from Redis`);
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] removeDriverFromRedis failed for ${driverIdStr}:`, err.message);
        return false;
    }
};

// UPDATE LOCATION
// Called on every driver location ping — updates geo position and ensures
// meta hash stays healthy (rebuilds it if it was deleted by a race condition).

export const updateDriverLocation = async (driverId, lng, lat, serviceAreaId = null) => {
    if (!driverId || lng == null || lat == null) return false;

    if (
        lng < -180 || lng > 180 ||
        lat < -90 || lat > 90
    ) {
        logger.warn(`[DriverGeo] Invalid coordinates for ${driverId}: [${lng}, ${lat}]`);
        return false;
    }

    const driverIdStr = driverId.toString();

    try {
        // Check if meta hash exists; if not, rebuild it (handles race with removeDriverFromRedis)
        const metaExists = await redis.exists(`driver:meta:${driverIdStr}`);

        const pipeline = redis.pipeline();

        if (serviceAreaId) {
            pipeline.geoadd(`drivers:${serviceAreaId.toString()}`, lng, lat, driverIdStr);
        }

        pipeline.geoadd("drivers:global", lng, lat, driverIdStr);

        if (!metaExists) {
            // Meta was deleted (race condition) — rebuild full meta so eligibility checks pass
            logger.info(`[DriverGeo] Rebuilding meta for ${driverIdStr} (was deleted)`);
            pipeline.hset(`driver:meta:${driverIdStr}`, {
                is_online: "true",
                is_on_trip: "false",
                service_area_id: serviceAreaId?.toString() ?? "",
                updated_at: Date.now().toString(),
            });
        } else {
            pipeline.hset(`driver:meta:${driverIdStr}`, { updated_at: Date.now().toString() });
        }

        // Refresh TTL on every ping — driver stays active as long as they're sending updates
        pipeline.expire(`driver:meta:${driverIdStr}`, 3600);

        await pipeline.exec();
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] updateDriverLocation failed for ${driverIdStr}:`, err.message);
        return false;
    }
};

// TRIP STATE
// These keep Redis meta in sync when a driver starts/finishes a trip.
// Always call these alongside the MongoDB update, not instead of it.

export const markDriverOnTrip = async (driverId, bookingId) => {
    if (!driverId) return false;

    try {
        await redis.hset(`driver:meta:${driverId.toString()}`, {
            is_on_trip: "true",
            current_booking_id: bookingId?.toString() ?? "",
            updated_at: Date.now().toString(),
        });
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] markDriverOnTrip failed for ${driverId}:`, err.message);
        return false;
    }
};

export const markDriverAvailable = async (driverId) => {
    if (!driverId) return false;

    try {
        await redis.hset(`driver:meta:${driverId.toString()}`, {
            is_on_trip: "false",
            current_booking_id: "",
            updated_at: Date.now().toString(),
        });
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] markDriverAvailable failed for ${driverId}:`, err.message);
        return false;
    }
};