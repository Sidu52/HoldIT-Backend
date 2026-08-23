/**
 * Standardized Cloudinary folder structure for Holdit application
 */
export const CLOUDINARY_FOLDERS = Object.freeze({
    ROOT: "holdit",
    USERS: {
        AVATARS: "holdit/users/avatars",
        DOCUMENTS: "holdit/users/documents",
    },
    DRIVERS: {
        AVATARS: "holdit/drivers/avatars",
        DOCUMENTS: "holdit/drivers/documents",
        VEHICLES: "holdit/drivers/vehicles",
    },
    STORES: {
        STOREFRONTS: "holdit/stores/storefronts",
        STORAGE_AREAS: "holdit/stores/storage_areas",
        DOCUMENTS: "holdit/stores/documents",
    },
    BOOKINGS: {
        PICKUP: "holdit/bookings/pickup",
        STORAGE: "holdit/bookings/storage",
        DELIVERY: "holdit/bookings/delivery",
    },
    SUPPORT: {
        ATTACHMENTS: "holdit/support/attachments",
    },
    REVIEWS: {
        PHOTOS: "holdit/reviews",
    },
    GENERAL: "holdit/general",
});

/**
 * Upload constraints for security and storage limits
 */
export const UPLOAD_LIMITS = Object.freeze({
    AVATAR_MAX_SIZE_MB: 3,
    PHOTO_MAX_SIZE_MB: 5,
    DOCUMENT_MAX_SIZE_MB: 10,
    MAX_MULTIPLE_FILES_COUNT: 5,
    ALLOWED_IMAGE_MIMES: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
    ],
    ALLOWED_DOCUMENT_MIMES: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
        "application/pdf",
    ],
});
