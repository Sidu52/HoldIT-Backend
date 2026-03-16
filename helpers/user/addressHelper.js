import ServiceableArea from "../../models/ServiceableArea.js";
import User from "../../models/User.js";
import { del } from "../../services/redisService.js";
import { CACHE_KEYS } from "../../constants/user/address.js";

// Check Serviceability
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
                    maxDistance: 100 * 1000, // 100km hard cap
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
            { $project: { _id: 1 } },
        ]);

        if (results.length > 0) {
            return { isServiceable: true, serviceAreaId: results[0]._id };
        }

        return { isServiceable: false, serviceAreaId: null };
    } catch (err) {
        console.error("Serviceability check error:", err);
        return { isServiceable: false, serviceAreaId: null };
    }
};

// Invalidate user's address cache
export const invalidateAddressCache = async (userId) => {
    try {
        await del(CACHE_KEYS.USER_ADDRESSES(userId));
    } catch (err) {
        console.error("Cache invalidation error:", err);
    }
};

// Update Location and Serviceability
export const syncUserLocationWithAddress = async (userId, address) => {
    const updateData = {};

    if (address?.coordinates?.length === 2) {
        const [lng, lat] = address.coordinates;
        const { isServiceable, serviceAreaId } = await checkServiceability(lat, lng);

        updateData.is_serviceable = isServiceable;
        updateData.service_area_id = serviceAreaId;
        updateData.location = {
            type: "Point",
            coordinates: [lng, lat],
            address: formatAddressString(address),
        };
    } else {
        updateData.is_serviceable = false;
        updateData.service_area_id = null;
        updateData.location = undefined;
    }

    await User.findByIdAndUpdate(userId, { $set: updateData });
};

// Format address string
export const formatAddressString = (address) => {
    return [
        address.street,
        address.city,
        address.state,
        address.postal_code,
        address.country,
    ]
        .filter(Boolean)
        .join(", ");
};

// Build address object
export const buildAddressObject = async (body) => {
    const address = {
        street: body.street.trim(),
        city: body.city.trim(),
        state: body.state.trim(),
        postal_code: body.postal_code.trim(),
        country: body.country.trim(),
        coordinates: body.coordinates || undefined,
        is_default: false,
        is_serviceable: false,
    };

    // Run serviceability check if coordinates provided
    if (address.coordinates) {
        const [lng, lat] = address.coordinates;
        const { isServiceable } = await checkServiceability(lat, lng);
        address.is_serviceable = isServiceable;
    }

    return address;
};

// Find address by index
export const findAddressById = (addresses, index) => {
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= addresses.length) {
        return { address: null, index: -1 };
    }
    return { address: addresses[idx], index: idx };
};