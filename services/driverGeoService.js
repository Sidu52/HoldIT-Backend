import redis from "./redisService.js";


export const addDriverToRedis = async (driver) => {
    if (!driver) {
        console.warn("[Driver Geo] driver is null/undefined");
        return false;
    }

    // ✅ Match YOUR actual DB fields
    if (!driver.is_active || !driver.is_online) {
        if (driver._id) {
            await removeDriverFromRedis(driver._id, driver.service_area_id);
        }
        return false;
    }

    // ✅ YOUR field is "currentLocation" not "location"
    const location = driver.currentLocation || driver.location;

    if (
        !location ||
        !location.coordinates ||
        location.coordinates.length < 2
    ) {
        console.warn(`[Driver Geo] Driver ${driver._id} has no valid coordinates`);
        return false;
    }

    const [lng, lat] = location.coordinates;

    if (
        typeof lng !== "number" || typeof lat !== "number" ||
        lng < -180 || lng > 180 ||
        lat < -90 || lat > 90
    ) {
        console.warn(`[Driver Geo] Driver ${driver._id} has invalid coordinates`);
        return false;
    }

    const driverIdStr = driver._id.toString();

    try {
        // Add to service area key
        if (driver.service_area_id) {
            await redis.geoadd(
                `drivers:${driver.service_area_id}`,
                lng, lat, driverIdStr
            );
        }

        // Add to global key
        await redis.geoadd("drivers:global", lng, lat, driverIdStr);

        // Store metadata
        const driverName = driver.name ||
            `${driver.first_name || ""} ${driver.last_name || ""}`.trim() ||
            "Unknown";

        await redis.hset(`driver:meta:${driverIdStr}`, {
            is_online: String(driver.is_online || false),
            is_on_trip: String(driver.is_on_trip || false),
            status: driver.status || "",
            verification_status: driver.verification_status || "",
            vehicle_type: driver.vehicle_type || "",
            name: driverName,
            phone: driver.phone || "",
            service_area_id: driver.service_area_id?.toString() || "",
            rating: (driver.rating || 0).toString(),
            current_booking_id: driver.current_booking_id?.toString() || "",
            updated_at: Date.now().toString(),
        });

        return true;
    } catch (err) {
        console.error(`[Driver Geo] Error for ${driver._id}:`, err.message);
        return false;
    }
};

/**
 * Remove driver from Redis
 */
export const removeDriverFromRedis = async (driverId, serviceAreaId = null) => {
    if (!driverId) return false;

    const driverIdStr = driverId.toString();

    try {
        if (serviceAreaId) {
            await redis.zrem(`drivers:${serviceAreaId}`, driverIdStr);
        } else {
            const meta = await redis.hget(`driver:meta:${driverIdStr}`, "service_area_id");
            if (meta) {
                await redis.zrem(`drivers:${meta}`, driverIdStr);
            }
        }

        await redis.zrem("drivers:global", driverIdStr);
        await redis.del(`driver:meta:${driverIdStr}`);

        return true;
    } catch (err) {
        console.error(`[Driver Geo] Remove error for ${driverId}:`, err.message);
        return false;
    }
};

/**
 * Update driver location
 */
export const updateDriverLocation = async (driverId, lng, lat, serviceAreaId = null) => {
    if (!driverId || lng == null || lat == null) return false;

    const driverIdStr = driverId.toString();

    try {
        if (serviceAreaId) {
            await redis.geoadd(`drivers:${serviceAreaId}`, lng, lat, driverIdStr);
        }

        await redis.geoadd("drivers:global", lng, lat, driverIdStr);

        await redis.hset(`driver:meta:${driverIdStr}`, {
            updated_at: Date.now().toString(),
        });

        return true;
    } catch (err) {
        console.error(`[Driver Geo] Location update error for ${driverId}:`, err.message);
        return false;
    }
};

/**
 * Mark driver as on trip
 */
export const markDriverOnTrip = async (driverId, bookingId) => {
    if (!driverId) return false;

    try {
        await redis.hset(`driver:meta:${driverId.toString()}`, {
            is_on_trip: "true",
            current_booking_id: bookingId?.toString() || "",
            updated_at: Date.now().toString(),
        });
        return true;
    } catch (err) {
        console.error(`[Driver Geo] markOnTrip error for ${driverId}:`, err.message);
        return false;
    }
};

/**
 * Mark driver as available
 */
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
        console.error(`[Driver Geo] markAvailable error for ${driverId}:`, err.message);
        return false;
    }
};