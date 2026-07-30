import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";

// Removed STORE_CACHE (Migrated to constants/redis/store.keys.js)

export const STORE_DEFAULTS = {
    NEARBY_RADIUS_KM: 10,
    MAX_NEARBY_RADIUS_KM: 50,
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
};

// Filter: Only show stores that are active, online, verified, and approved
export const STORE_VISIBILITY_FILTER = {
    verification_status: VERIFICATION_STATUS.VERIFIED,
    account_status: ACCOUNT_STATUS.ACTIVE,
};

// Select Fields
export const STORE_SELECT = {
    LIST: "store_name store_open_time store_close_time store_description store_contact_number location rating rating_count is_online",
    DETAIL: "store_name store_open_time store_close_time store_description store_contact_number location rating rating_count is_online current_booking_count max_booking_capacity service_area_id",
    AVAILABILITY: "store_name current_booking_count max_booking_capacity is_online store_open_time store_close_time",
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