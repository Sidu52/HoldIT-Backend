import ServiceableArea from "../../models/ServiceableArea";

// Check Serviceability
export const checkServiceability = async (lng, lat) => {
    if (
        typeof lat !== "number" || typeof lng !== "number" ||
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180
    ) {
        logger.warn(`Serviceability Invalid coordinates: lat=${lat}, lng=${lng}`);
        return { isServiceable: false, serviceAreaId: null, error: "INVALID_COORDS" };
    }

    try {
        const results = await ServiceableArea.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    distanceField: "distance",
                    spherical: true,
                    query: { is_active: true },
                    maxDistance: 100 * 1000,
                },
            },
            {
                $match: {
                    $expr: { $lte: ["$distance", { $multiply: ["$service_radius_km", 1000] }] },
                },
            },
            { $sort: { distance: 1 } },
            { $limit: 1 },
            { $project: { _id: 1, name: 1, service_radius_km: 1, distance: 1 } },
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
        logger.error("Serviceability check error:", err);
        return { isServiceable: false, serviceAreaId: null };
    }
};
