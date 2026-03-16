import redis from "./redisService.js";

export const addDriverToRedis = async (driver) => {
    if (!driver) {
        console.warn("addDriverToRedis: driver is null/undefined");
        return false;
    }

    if (!driver.is_active || !driver.is_online) {
        if (driver._id) {
            await removeDriverFromRedis(driver._id, driver.service_area_id);
        }
        return false;
    }

    //  Validate coordinates exist before destructuring
    if (
        !driver.currentLocation ||
        !driver.currentLocation.coordinates ||
        driver.currentLocation.coordinates.length < 2
    ) {
        console.warn(`addDriverToRedis: Driver ${driver._id} has no valid coordinates`);
        return false;
    }

    const [lng, lat] = driver.currentLocation.coordinates;

    // Validate coordinate ranges
    if (
        typeof lng !== "number" || typeof lat !== "number" ||
        lng < -180 || lng > 180 ||
        lat < -90 || lat > 90
    ) {
        console.warn(`addDriverToRedis: Driver ${driver._id} has invalid coordinates [${lng}, ${lat}]`);
        return false;
    }

    // Scope geoset by service area
    const geoKey = driver.service_area_id
        ? `drivers:${driver.service_area_id}`
        : "drivers:global";

    try {
        await redis.geoadd(geoKey, lng, lat, driver._id.toString());
        await redis.hset(`driver:meta:${driver._id}`, {
            is_online: "true",
            vehicle_type: driver.vehicle_type || "SCOOTER",
            service_area_id: driver.service_area_id?.toString() || "",
            updated_at: Date.now().toString(),
        });
        await redis.expire(`driver:meta:${driver._id}`, 3600); 
        return true;
    } catch (err) {
        console.error(`addDriverToRedis error for driver ${driver._id}:`, err.message);
        return false;
    }
};

export const removeDriverFromRedis = async (driverId, serviceAreaId = null) => {
    if (!driverId) {
        console.warn("removeDriverFromRedis: driverId is null/undefined");
        return false;
    }

    const driverIdStr = driverId.toString();

    try {
        if (serviceAreaId) {
            await redis.zrem(`drivers:${serviceAreaId}`, driverIdStr);
        } else {
            const meta = await redis.hget(`driver:meta:${driverIdStr}`, "service_area_id");
            if (meta) {
                await redis.zrem(`drivers:${meta}`, driverIdStr);
            }
            await redis.zrem("drivers:global", driverIdStr);
        }
        await redis.del(`driver:meta:${driverIdStr}`);
        return true;
    } catch (err) {
        console.error(`removeDriverFromRedis error for driver ${driverId}:`, err.message);
        return false;
    }
};

export const findNearbyDrivers = async (serviceAreaId, lng, lat, radiusKm = 5, count = 10) => {
    if (!serviceAreaId || lng === undefined || lat === undefined) {
        throw new Error("serviceAreaId, lng, and lat are required");
    }

    const geoKey = `drivers:${serviceAreaId}`;

    try {
        const results = await redis.georadius(
            geoKey,
            lng,
            lat,
            radiusKm,
            "km",
            "WITHCOORD",
            "WITHDIST",
            "ASC",
            "COUNT",
            count
        );

        return results.map(([driverId, distance, coords]) => ({
            driverId,
            distanceKm: parseFloat(distance),
            coordinates: {
                lng: parseFloat(coords[0]),
                lat: parseFloat(coords[1]),
            },
        }));
    } catch (err) {
        console.error("findNearbyDrivers error:", err.message);
        return [];
    }
};