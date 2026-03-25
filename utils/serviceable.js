import ServiceableArea from "../models/ServiceableArea.js";
import logger from "./logger.js";


// Safe upper bound for $geoNear pre-filter.
// Must be larger than any possible service_radius_km in the DB.
// $geoNear requires maxDistance in metres — this is 500 km.
// The actual business radius is enforced by the $match below.
const GEO_NEAR_MAX_DISTANCE_M = 500 * 1000;

/**
 * Check whether a lat/lng falls within any active serviceable area.
 *
 * Returns:
 *   { isServiceable: true,  serviceAreaId: ObjectId, serviceAreaName: string }
 *   { isServiceable: false, serviceAreaId: null }
 *   { isServiceable: false, serviceAreaId: null, error: "INVALID_COORDS" | "DB_ERROR" }
 */
export const checkServiceability = async (lat, lng) => {
    // Validate coordinates before touching the DB
    if (
        typeof lat !== "number" || typeof lng !== "number" ||
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180
    ) {
        logger.warn(`[Serviceability] Invalid coordinates: lat=${lat}, lng=${lng}`);
        return { isServiceable: false, serviceAreaId: null, error: "INVALID_COORDS" };
    }

    try {
        const results = await ServiceableArea.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [lng, lat],    // GeoJSON: [lng, lat]
                    },
                    distanceField: "distance",       // metres from the area's center
                    spherical: true,
                    query: { is_active: true },
                    // Pre-filter: drop anything further than 500 km
                    // Real radius check happens in $match below
                    maxDistance: GEO_NEAR_MAX_DISTANCE_M,
                },
            },
            {
                // Only include areas where the point falls within service_radius_km
                $match: {
                    $expr: {
                        $lte: [
                            "$distance",
                            { $multiply: ["$service_radius_km", 1000] },
                        ],
                    },
                },
            },
            // Closest matching area first
            { $sort: { distance: 1 } },
            { $limit: 1 },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    service_radius_km: 1,
                    distance: 1,
                },
            },
        ]);

        if (results.length > 0) {
            return {
                isServiceable: true,
                serviceAreaId: results[0]._id,
                serviceAreaName: results[0].name,
                distanceM: Math.round(results[0].distance),
            };
        }

        return { isServiceable: false, serviceAreaId: null };
    } catch (err) {
        logger.error("[Serviceability] DB error:", err.message);
        // Return a distinct error type so the caller can differentiate
        // a real DB failure from a simple "not in service area" response
        return { isServiceable: false, serviceAreaId: null, error: "DB_ERROR" };
    }
};