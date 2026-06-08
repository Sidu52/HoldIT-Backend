export const ADDRESS_MESSAGES = {
    // Success
    FETCHED: "Addresses fetched successfully.",
    ADDED: "Address added successfully.",
    UPDATED: "Address updated successfully.",
    DELETED: "Address deleted successfully.",

    // Errors
    USER_NOT_FOUND: "User not found.",
    ADDRESS_NOT_FOUND: "Address not found.",
    MAX_LIMIT_REACHED: `Maximum address limit (${10}) reached. Remove an existing address first.`,
    CANNOT_REMOVE_LAST_DEFAULT: "Cannot remove the only default address.",
    FETCH_FAILED: "Failed to fetch addresses.",
    ADD_FAILED: "Failed to add address.",
    UPDATE_FAILED: "Failed to update address.",
    DELETE_FAILED: "Failed to delete address.",
};

// LIMITS
export const ADDRESS_LIMITS = {
    MAX_ADDRESSES: 10,
};

// CACHE KEYS
export const CACHE_KEYS = {
    USER_ADDRESSES: (userId) => `user:addresses:${userId}`,
    USER_ADDRESS_DETAIL: (userId, addressId) => `user:${userId}:address:${addressId}`,
};

// CACHE TTL (seconds)
export const CACHE_TTL = {
    LIST: 120,
    DETAIL: 300,
};