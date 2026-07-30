import redis from "./redisService.js";
import { DriverKeys, DriverTTL } from "../constants/redis/driver.keys.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";
import logger from "../utils/logger.js";

// ADD
export const addDriverToRedis = async (driver) => {
    if (!driver?._id) {
        logger.warn("[DriverGeo] addDriverToRedis: missing driver or _id");
        return false;
    }

    if (
        !driver.is_online ||
        driver.is_on_trip ||
        driver.account_status !== ACCOUNT_STATUS.ACTIVE ||
        driver.verification_status !== VERIFICATION_STATUS.VERIFIED
    ) {
        await removeDriverFromRedis(driver._id, driver.service_area_id).catch(() => { });
        return false;
    }

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
        lng < -180 || lng > 180 || lat < -90 || lat > 90
    ) {
        logger.warn(`[DriverGeo] Driver ${driver._id} has invalid coordinates [${lng}, ${lat}]`);
        return false;
    }

    const driverId = driver._id.toString();

    try {
        const pipeline = redis.pipeline();

        if (driver.service_area_id) {
            pipeline.geoadd(DriverKeys.geoByArea(driver.service_area_id), lng, lat, driverId);
        }
        pipeline.geoadd(DriverKeys.geoGlobal(), lng, lat, driverId);

        pipeline.hset(DriverKeys.meta(driverId), {
            is_online: "true",
            is_on_trip: "false",
            vehicle_type: driver.vehicle_type ?? "scooter",
            service_area_id: driver.service_area_id?.toString() ?? "",
            updated_at: Date.now().toString(),
        });
        pipeline.expire(DriverKeys.meta(driverId), DriverTTL.GEO_META);

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
            pipeline.zrem(DriverKeys.geoByArea(serviceAreaId), driverIdStr);
        } else {
            const areaId = await redis.hget(DriverKeys.meta(driverIdStr), "service_area_id");
            if (areaId) pipeline.zrem(DriverKeys.geoByArea(areaId), driverIdStr);
        }

        pipeline.zrem(DriverKeys.geoGlobal(), driverIdStr);
        pipeline.del(DriverKeys.meta(driverIdStr));

        await pipeline.exec();
        logger.info(`[DriverGeo] Driver ${driverIdStr} removed from Redis`);
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] removeDriverFromRedis failed for ${driverIdStr}:`, err.message);
        return false;
    }
};

// UPDATE LOCATION
export const updateDriverLocation = async (driverId, lng, lat, serviceAreaId = null) => {
    if (!driverId || lng == null || lat == null) return false;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        logger.warn(`[DriverGeo] Invalid coordinates for ${driverId}: [${lng}, ${lat}]`);
        return false;
    }

    const driverIdStr = driverId.toString();

    try {
        const metaExists = await redis.exists(DriverKeys.meta(driverIdStr));
        const pipeline = redis.pipeline();

        if (serviceAreaId) {
            pipeline.geoadd(DriverKeys.geoByArea(serviceAreaId), lng, lat, driverIdStr);
        }
        pipeline.geoadd(DriverKeys.geoGlobal(), lng, lat, driverIdStr);

        if (!metaExists) {
            logger.info(`[DriverGeo] Rebuilding meta for ${driverIdStr} (was deleted)`);
            pipeline.hset(DriverKeys.meta(driverIdStr), {
                is_online: "true",
                is_on_trip: "false",
                service_area_id: serviceAreaId?.toString() ?? "",
                updated_at: Date.now().toString(),
            });
        } else {
            pipeline.hset(DriverKeys.meta(driverIdStr), { updated_at: Date.now().toString() });
        }

        pipeline.expire(DriverKeys.meta(driverIdStr), DriverTTL.GEO_META);

        await pipeline.exec();
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] updateDriverLocation failed for ${driverIdStr}:`, err.message);
        return false;
    }
};

// TRIP STATE
export const markDriverOnTrip = async (driverId, bookingId) => {
    if (!driverId) return false;

    try {
        const driverIdStr = driverId.toString();
        const metaExists = await redis.exists(DriverKeys.meta(driverIdStr));

        const pipeline = redis.pipeline();
        pipeline.hset(DriverKeys.meta(driverIdStr), {
            is_on_trip: "true",
            current_booking_id: bookingId?.toString() ?? "",
            updated_at: Date.now().toString(),
        });
        // ALWAYS refresh TTL — fixes the "meta lives forever" bug
        pipeline.expire(DriverKeys.meta(driverIdStr), DriverTTL.GEO_META);
        await pipeline.exec();

        if (!metaExists) {
            logger.warn(`[DriverGeo] markDriverOnTrip: meta was missing for ${driverIdStr}, created partial hash — is_online/vehicle_type/service_area_id absent until next location ping`);
        }
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] markDriverOnTrip failed for ${driverId}:`, err.message);
        return false;
    }
};

export const markDriverAvailable = async (driverId) => {
    if (!driverId) return false;

    try {
        const driverIdStr = driverId.toString();
        const pipeline = redis.pipeline();
        pipeline.hset(DriverKeys.meta(driverIdStr), {
            is_on_trip: "false",
            current_booking_id: "",
            updated_at: Date.now().toString(),
        });
        pipeline.expire(DriverKeys.meta(driverIdStr), DriverTTL.GEO_META);
        await pipeline.exec();
        return true;
    } catch (err) {
        logger.error(`[DriverGeo] markDriverAvailable failed for ${driverId}:`, err.message);
        return false;
    }
};