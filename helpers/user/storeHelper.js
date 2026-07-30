import Store from "../../models/Store.js";
import { STORE_VISIBILITY_FILTER } from "../../constants/user/store.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";

// Query Builders
export const buildSearchFilter = (query) => {
    const filter = { ...STORE_VISIBILITY_FILTER };

    if (query && query.trim()) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [{ store_name: { $regex: escapedQuery, $options: "i" } }];
    }

    return filter;
};

// DB Queries
export const buildNearbyPipeline = (lat, lng, radiusKm, skip, limit, selectFields) => {
    const maxDistanceMeters = radiusKm * 1000;

    const projectFields = {};
    selectFields.split(" ").forEach((field) => {
        if (field) projectFields[field] = 1;
    });
    projectFields.distance = 1;

    return [
        {
            $geoNear: {
                near: { type: "Point", coordinates: [lng, lat] },
                distanceField: "distance",
                spherical: true,
                maxDistance: maxDistanceMeters,
                query: { ...STORE_VISIBILITY_FILTER },
            },
        },
        { $sort: { distance: 1 } },
        {
            $facet: {
                metadata: [{ $count: "total" }],
                stores: [{ $skip: skip }, { $limit: limit }, { $project: projectFields }],
            },
        },
    ];
};

// Data Transformers
export const formatDistance = (distanceInMeters) => {
    if (distanceInMeters < 1000) {
        return `${Math.round(distanceInMeters)} m`;
    }
    return `${(distanceInMeters / 1000).toFixed(1)} km`;
};

export const enrichNearbyStores = (stores) =>
    stores.map((store) => ({
        ...store,
        distanceFormatted: formatDistance(store.distance),
        distanceKm: parseFloat((store.distance / 1000).toFixed(2)),
    }));

export const calculateAvailability = (store) => {
    const { current_booking_count = 0, max_booking_capacity = 0 } = store;
    const availableSlots = Math.max(0, max_booking_capacity - current_booking_count);

    const isCurrentlyOpen = checkStoreOpenStatus(store.store_open_time, store.store_close_time);

    return {
        storeId: store._id,
        storeName: store.store_name,
        isOnline: store.is_online,
        verification_status: store.verification_status,
        account_status: store.account_status,
        isCurrentlyOpen,
        totalCapacity: max_booking_capacity,
        currentBookings: current_booking_count,
        availableSlots,
        utilizationPercent: max_booking_capacity > 0
            ? parseFloat(((current_booking_count / max_booking_capacity) * 100).toFixed(1))
            : 0,
        canAcceptBooking:
            store.is_online &&
            store.account_status === ACCOUNT_STATUS.ACTIVE &&
            store.verification_status === VERIFICATION_STATUS.VERIFIED &&
            isCurrentlyOpen &&
            availableSlots > 0,
        operatingHours: {
            open: store.store_open_time || null,
            close: store.store_close_time || null,
        },
    };
};

export const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const checkStoreOpenStatus = (openTime, closeTime) => {
    if (!openTime || !closeTime) return true;
    try {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const [openH, openM] = openTime.split(":").map(Number);
        const [closeH, closeM] = closeTime.split(":").map(Number);

        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;

        if (closeMinutes < openMinutes) {
            return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
        }

        return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } catch {
        return true;
    }
};

export const findVisibleStoreById = async (storeId, selectFields) => {
    return Store.findOne({ _id: storeId, ...STORE_VISIBILITY_FILTER }).select(selectFields).lean();
};

export const findStoreById = async (storeId, selectFields) => {
    return Store.findById(storeId).select(selectFields).lean();
};

export { buildPagination } from "../../utils/helper.js";