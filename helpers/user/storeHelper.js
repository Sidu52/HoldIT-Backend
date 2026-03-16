import Store from "../../models/Store.js";
import { get, set } from "../../services/redisService.js";
import {
    STORE_VISIBILITY_FILTER
} from "../../constants/user/store.js";

// Cache
export const getCachedData = async (cacheKey) => {
    try {
        const cached = await get(cacheKey);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error("Store cache read error:", err);
        return null;
    }
};


// Query Builders
export const setCacheData = async (cacheKey, data, ttl) => {
    try {
        await set(cacheKey, JSON.stringify(data), "EX", ttl);
    } catch (err) {
        console.error("Store cache write error:", err);
    }
};

// Data Transformers
export const buildSearchFilter = (query) => {
    const filter = { ...STORE_VISIBILITY_FILTER };

    if (query && query.trim()) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { store_name: { $regex: escapedQuery, $options: "i" } },
            { store_address: { $regex: escapedQuery, $options: "i" } },
        ];
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
                near: {
                    type: "Point",
                    coordinates: [lng, lat],
                },
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
                stores: [
                    { $skip: skip },
                    { $limit: limit },
                    { $project: projectFields },
                ],
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


export const enrichNearbyStores = (stores) => {
    return stores.map((store) => ({
        ...store,
        distanceFormatted: formatDistance(store.distance),
        distanceKm: parseFloat((store.distance / 1000).toFixed(2)),
    }));
};

export const calculateAvailability = (store) => {
    const { booking_assigned_count = 0, max_booking_capacity = 0 } = store;
    const availableSlots = Math.max(0, max_booking_capacity - booking_assigned_count);

    // Determine current open/closed status
    const isCurrentlyOpen = checkStoreOpenStatus(
        store.store_open_time,
        store.store_close_time
    );

    return {
        storeId: store._id,
        storeName: store.store_name,
        isOnline: store.is_online,
        isActive: store.is_active,
        isCurrentlyOpen,
        totalCapacity: max_booking_capacity,
        currentBookings: booking_assigned_count,
        availableSlots,
        utilizationPercent: max_booking_capacity > 0
            ? parseFloat(((booking_assigned_count / max_booking_capacity) * 100).toFixed(1))
            : 0,
        canAcceptBooking: store.is_online && store.is_active && isCurrentlyOpen && availableSlots > 0,
        operatingHours: {
            open: store.store_open_time || null,
            close: store.store_close_time || null,
        },
    };
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

        // Handle overnight hours (e.g., 22:00 - 06:00)
        if (closeMinutes < openMinutes) {
            return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
        }

        return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } catch {
        return true;
    }
};

export const findVisibleStoreById = async (storeId, selectFields) => {
    return Store.findOne({
        _id: storeId,
        ...STORE_VISIBILITY_FILTER,
    })
        .select(selectFields)
        .lean();
};

export const findStoreById = async (storeId, selectFields) => {
    return Store.findById(storeId)
        .select(selectFields)
        .lean();
};

export const buildPagination = (page, limit, total) => {
    const totalPages = Math.ceil(total / limit);
    return {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
};