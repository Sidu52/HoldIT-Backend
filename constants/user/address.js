export const ADDRESS_LIMITS = {
    MAX_ADDRESSES: 10,
};

export const CACHE_KEYS = {
    USER_ADDRESSES: (userId) => `user:${userId}:addresses`,
};

export const CACHE_TTL = {
    ADDRESSES: 600,
};

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