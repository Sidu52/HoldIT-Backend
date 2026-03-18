import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";

export const STORE_CACHE = {
    SEARCH_KEY: (query, page, limit, sort) =>
        `stores:search:${query}:${page}:${limit}:${sort}`,
    NEARBY_KEY: (lat, lng, radius, page, limit) =>
        `stores:nearby:${lat}:${lng}:${radius}:${page}:${limit}`,
    DETAIL_KEY: (storeId) => `store:detail:${storeId}`,
    AVAILABILITY_KEY: (storeId) => `store:availability:${storeId}`,

    SEARCH_TTL: 120,        // 2 minutes
    NEARBY_TTL: 60,         // 1 minute (location-sensitive)
    DETAIL_TTL: 300,        // 5 minutes
    AVAILABILITY_TTL: 30,   // 30 seconds (real-time sensitive)
};

export const STORE_DEFAULTS = {
    NEARBY_RADIUS_KM: 10,
    MAX_NEARBY_RADIUS_KM: 50,
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
};

// Filter: Only show stores that are active, online, verified, and approved
export const STORE_VISIBILITY_FILTER = {
    is_active: true,
    is_online: true,
    verification_status: VERIFICATION_STATUS.VERIFIED,
    status: ACCOUNT_STATUS.ACTIVE,
};

// Select Fields
export const STORE_SELECT = {
    LIST: "store_name store_open_time store_close_time store_description store_contact_number location rating rating_count is_online",
    DETAIL: "store_name store_open_time store_close_time store_description store_contact_number location rating rating_count is_online current_booking_count max_booking_capacity service_area_id",
    AVAILABILITY: "store_name current_booking_count max_booking_capacity is_online is_active store_open_time store_close_time",
};

// Messages
export const STORE_MESSAGES = {
    // Success
    SEARCH_SUCCESS: "Stores fetched successfully.",
    NEARBY_SUCCESS: "Nearby stores fetched successfully.",
    DETAIL_SUCCESS: "Store details fetched successfully.",
    AVAILABILITY_SUCCESS: "Store availability fetched successfully.",

    // Errors
    STORE_NOT_FOUND: "Store not found.",
    SEARCH_FAILED: "Failed to search stores.",
    NEARBY_FAILED: "Failed to fetch nearby stores.",
    DETAIL_FAILED: "Failed to fetch store details.",
    AVAILABILITY_FAILED: "Failed to fetch store availability.",
    INVALID_COORDINATES: "Valid latitude and longitude are required.",
    STORE_UNAVAILABLE: "This store is currently unavailable.",
};