import ServiceableArea from "../models/ServiceableArea.js";

export const checkServiceability = async (lat, lng) => {
    try {
        const results = await ServiceableArea.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [lng, lat],
                    },
                    distanceField: "distance",
                    spherical: true,
                    query: { is_active: true },
                    maxDistance: 100 * 1000,
                },
            },
            {
                $match: {
                    $expr: {
                        $lte: [
                            "$distance",
                            { $multiply: ["$service_radius_km", 1000] },
                        ],
                    },
                },
            },
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
            };
        }

        return {
            isServiceable: false,
            serviceAreaId: null,
        };
    } catch (err) {
        console.error("Serviceability check error:", err);
        return {
            isServiceable: false,
            serviceAreaId: null,
        };
    }
};