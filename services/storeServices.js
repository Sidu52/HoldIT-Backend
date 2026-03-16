import redis from "./redisService.js";

export const addStoreToRedis = async (store) => {
    // ... existing validation ...

    const [lng, lat] = store.location.coordinates;

    // ... existing validation ...

    try {
        // Add to service area key
        if (store.service_area_id) {
            const areaKey = `stores:${store.service_area_id}`;
            await redis.geoadd(areaKey, lng, lat, store._id.toString());
        }

        // ✅ ALSO add to global key (fallback for bookings without serviceAreaId)
        await redis.geoadd("stores:global", lng, lat, store._id.toString());

        // Store metadata
        await redis.hset(`store:meta:${store._id}`, {
            is_online: "true",
            booking_assigned_count: (store.booking_assigned_count || 0).toString(),
            max_booking_capacity: (store.max_booking_capacity || 50).toString(),
            service_area_id: store.service_area_id?.toString() || "",
            rating: (store.rating || 0).toString(),
            updated_at: Date.now().toString(),
        });

        return true;
    } catch (err) {
        console.error(`addStoreToRedis error for store ${store._id}:`, err.message);
        return false;
    }
};

export const removeStoreFromRedis = async (storeId, serviceAreaId = null) => {
    if (!storeId) return false;

    const storeIdStr = storeId.toString();

    try {
        // Remove from service area key
        if (serviceAreaId) {
            await redis.zrem(`stores:${serviceAreaId}`, storeIdStr);
        } else {
            const meta = await redis.hget(`store:meta:${storeIdStr}`, "service_area_id");
            if (meta) {
                await redis.zrem(`stores:${meta}`, storeIdStr);
            }
        }

        // ✅ ALSO remove from global
        await redis.zrem("stores:global", storeIdStr);

        // Remove metadata
        await redis.del(`store:meta:${storeIdStr}`);

        return true;
    } catch (err) {
        console.error(`removeStoreFromRedis error for store ${storeId}:`, err.message);
        return false;
    }
};