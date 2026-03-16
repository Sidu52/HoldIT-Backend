import redis from "./redisService.js";

// ─── ADD ──────────────────────────────────────────────────────────────────────

export const addStoreToRedis = async (store) => {
    if (!store?._id) {
        console.warn("[StoreGeo] addStoreToRedis: missing store or _id");
        return false;
    }

    // Validate location structure
    if (
        !store.location?.coordinates ||
        !Array.isArray(store.location.coordinates) ||
        store.location.coordinates.length < 2
    ) {
        console.warn(`[StoreGeo] Store ${store._id} has no valid coordinates`);
        return false;
    }

    const [lng, lat] = store.location.coordinates;

    if (
        typeof lng !== "number" || typeof lat !== "number" ||
        lng < -180 || lng > 180 ||
        lat < -90  || lat > 90
    ) {
        console.warn(
            `[StoreGeo] Store ${store._id} has invalid coordinates [${lng}, ${lat}]`
        );
        return false;
    }

    const storeId = store._id.toString();

    try {
        const pipeline = redis.pipeline();

        // Write to service-area key if present
        if (store.service_area_id) {
            pipeline.geoadd(`stores:${store.service_area_id.toString()}`, lng, lat, storeId);
        }

        // Always write to global fallback
        pipeline.geoadd("stores:global", lng, lat, storeId);

        // Store metadata hash
        pipeline.hset(`store:meta:${storeId}`, {
            is_online:              "true",
            booking_assigned_count: (store.booking_assigned_count ?? 0).toString(),
            max_booking_capacity:   (store.max_booking_capacity   ?? 50).toString(),
            service_area_id:        store.service_area_id?.toString() ?? "",
            rating:                 (store.rating ?? 0).toString(),
            updated_at:             Date.now().toString(),
        });

        // Meta TTL — expire after 2 hours of inactivity
        // Geo keys are NOT expired; they are managed explicitly via remove
        pipeline.expire(`store:meta:${storeId}`, 7200);

        await pipeline.exec();

        console.log(`[StoreGeo] Store ${storeId} added at [${lng}, ${lat}]`);
        return true;
    } catch (err) {
        console.error(`[StoreGeo] addStoreToRedis failed for ${storeId}:`, err.message);
        return false;
    }
};

// ─── REMOVE ───────────────────────────────────────────────────────────────────

export const removeStoreFromRedis = async (storeId, serviceAreaId = null) => {
    if (!storeId) {
        console.warn("[StoreGeo] removeStoreFromRedis: missing storeId");
        return false;
    }

    const storeIdStr = storeId.toString();

    try {
        const pipeline = redis.pipeline();

        if (serviceAreaId) {
            pipeline.zrem(`stores:${serviceAreaId.toString()}`, storeIdStr);
        } else {
            // Look up service area from meta if not provided
            const areaId = await redis.hget(`store:meta:${storeIdStr}`, "service_area_id");
            if (areaId) {
                pipeline.zrem(`stores:${areaId}`, storeIdStr);
            }
        }

        // Always remove from global
        pipeline.zrem("stores:global", storeIdStr);

        // Remove metadata
        pipeline.del(`store:meta:${storeIdStr}`);

        await pipeline.exec();

        console.log(`[StoreGeo] Store ${storeIdStr} removed from Redis`);
        return true;
    } catch (err) {
        console.error(`[StoreGeo] removeStoreFromRedis failed for ${storeIdStr}:`, err.message);
        return false;
    }
};

// ─── UPDATE CAPACITY ─────────────────────────────────────────────────────────
// Call this after incrementing/decrementing booking_assigned_count in MongoDB
// so Redis meta stays in sync without a full re-sync.

export const updateStoreCapacityInRedis = async (storeId, newCount) => {
    if (!storeId) return false;

    try {
        await redis.hset(`store:meta:${storeId.toString()}`, {
            booking_assigned_count: newCount.toString(),
            updated_at:             Date.now().toString(),
        });
        return true;
    } catch (err) {
        console.error(`[StoreGeo] updateStoreCapacity failed for ${storeId}:`, err.message);
        return false;
    }
};