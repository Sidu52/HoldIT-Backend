import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";

// Removed DRIVER_CACHE (Migrated to constants/redis/driver.keys.js)

export const DRIVER_VISIBILITY_FILTER = {
    verification_status: VERIFICATION_STATUS.VERIFIED,
    account_status: ACCOUNT_STATUS.ACTIVE,
};

export const DRIVER_SELECT = {
    DETAIL: "first_name last_name vehicle_type is_online rating rating_count currentLocation.address service_area_id",
    MINIMAL: "first_name last_name vehicle_type is_online",
};

export const DRIVER_DEFAULTS = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
};

export const DRIVER_MESSAGES = {
    DETAIL_SUCCESS: "Driver details fetched successfully.",
    REVIEWS_SUCCESS: "Driver reviews fetched successfully.",
    DRIVER_NOT_FOUND: "Driver not found.",
    DETAIL_FAILED: "Failed to fetch driver details.",
    REVIEWS_FAILED: "Failed to fetch driver reviews.",
    NO_REVIEWS: "No reviews found for this driver.",
};