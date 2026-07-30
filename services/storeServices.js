import Store from "../models/Store.js";
import redis from "./redisService.js";
import { StoreKeys } from "../constants/redis/store.keys.js";
import logger from "../utils/logger.js";



// ─── ADD ──────────────────────────────────────────────────────────────────────

export const addStoreToRedis = async (store) => {
    if (!store?._id) {
        logger.warn("[StoreGeo] addStoreToRedis: missing store or _id");
        return false;
    }

    // Validate location structure
    if (
        !store.location?.coordinates ||
        !Array.isArray(store.location.coordinates) ||
        store.location.coordinates.length < 2
    ) {
        logger.warn(`[StoreGeo] Store ${store._id} has no valid coordinates`);
        return false;
    }

    const [lng, lat] = store.location.coordinates;

    if (
        typeof lng !== "number" || typeof lat !== "number" ||
        lng < -180 || lng > 180 ||
        lat < -90  || lat > 90
    ) {
        logger.warn(
            `[StoreGeo] Store ${store._id} has invalid coordinates [${lng}, ${lat}]`
        );
        return false;
    }

    const storeId = store._id.toString();

    try {
        const pipeline = redis.pipeline();

        // Write to service-area key if present
        if (store.service_area_id) {
            pipeline.geoadd(StoreKeys.geoByArea(store.service_area_id.toString()), lng, lat, storeId);
        }

        // Always write to global fallback
        pipeline.geoadd(StoreKeys.geoByArea("global"), lng, lat, storeId);

        // Store metadata hash
        pipeline.hset(StoreKeys.meta(storeId), {
            is_online:              "true",
            current_booking_count: (store.current_booking_count ?? 0).toString(),
            max_booking_capacity:   (store.max_booking_capacity   ?? 50).toString(),
            service_area_id:        store.service_area_id?.toString() ?? "",
            rating:                 (store.rating ?? 0).toString(),
            updated_at:             Date.now().toString(),
        });

        // Meta TTL — expire after 2 hours of inactivity
        // Geo keys are NOT expired; they are managed explicitly via remove
        pipeline.expire(StoreKeys.meta(storeId), 7200);

        await pipeline.exec();

        logger.info(`[StoreGeo] Store ${storeId} added at [${lng}, ${lat}]`);
        return true;
    } catch (err) {
        logger.error(`[StoreGeo] addStoreToRedis failed for ${storeId}:`, err.message);
        return false;
    }
};

// ─── REMOVE ───────────────────────────────────────────────────────────────────

export const removeStoreFromRedis = async (storeId, serviceAreaId = null) => {
    if (!storeId) {
        logger.warn("[StoreGeo] removeStoreFromRedis: missing storeId");
        return false;
    }

    const storeIdStr = storeId.toString();

    try {
        const pipeline = redis.pipeline();

        if (serviceAreaId) {
            pipeline.zrem(StoreKeys.geoByArea(serviceAreaId.toString()), storeIdStr);
        } else {
            // Look up service area from meta if not provided
            const areaId = await redis.hget(StoreKeys.meta(storeIdStr), "service_area_id");
            if (areaId) {
                pipeline.zrem(StoreKeys.geoByArea(areaId), storeIdStr);
            }
        }

        // Always remove from global
        pipeline.zrem(StoreKeys.geoByArea("global"), storeIdStr);

        // Remove metadata
        pipeline.del(StoreKeys.meta(storeIdStr));

        await pipeline.exec();

        logger.info(`[StoreGeo] Store ${storeIdStr} removed from Redis`);
        return true;
    } catch (err) {
        logger.error(`[StoreGeo] removeStoreFromRedis failed for ${storeIdStr}:`, err.message);
        return false;
    }
};

// ─── UPDATE CAPACITY ─────────────────────────────────────────────────────────
// Call this after incrementing/decrementing current_booking_count in MongoDB
// so Redis meta stays in sync without a full re-sync.

export const updateStoreCapacityInRedis = async (storeId, newCount) => {
    if (!storeId) return false;

    try {
        await redis.hset(StoreKeys.meta(storeId.toString()), {
            current_booking_count: newCount.toString(),
            updated_at:             Date.now().toString(),
        });
        return true;
    } catch (err) {
        logger.error(`[StoreGeo] updateStoreCapacity failed for ${storeId}:`, err.message);
        return false;
    }
};

// ─── TRANSACTIONAL CAPACITY HELPERS ──────────────────────────────────────────

/**
 * Atomically increments the store's booking count in MongoDB and Redis.
 * Should be called when luggage is successfully STORED.
 */
export const incrementStoreCapacity = async (storeId) => {
    if (!storeId) return null;

    try {
        const store = await Store.findByIdAndUpdate(
            storeId,
            { $inc: { current_booking_count: 1 } },
            { new: true, select: "current_booking_count" }
        ).lean();

        if (store) {
            await updateStoreCapacityInRedis(storeId, store.current_booking_count);
        }
        return store?.current_booking_count;
    } catch (err) {
        logger.error(`[StoreGeo] incrementStoreCapacity failed: ${err.message}`);
        return null;
    }
};

/**
 * Atomically decrements the store's booking count in MongoDB and Redis.
 * Should be called when luggage is released (VERIFY RETURN OTP).
 */
export const decrementStoreCapacity = async (storeId) => {
    if (!storeId) return null;

    try {
        const store = await Store.findByIdAndUpdate(
            storeId,
            { $inc: { current_booking_count: -1 } },
            { new: true, select: "current_booking_count" }
        ).lean();

        if (store) {
            await updateStoreCapacityInRedis(storeId, store.current_booking_count);
        }
        return store?.current_booking_count;
    } catch (err) {
        logger.error(`[StoreGeo] decrementStoreCapacity failed: ${err.message}`);
        return null;
    }
};