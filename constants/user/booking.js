import { BOOKING_STATUS, JOB_QUEUES, WORKER_CONFIG } from "../../utils/constants.js";

// REDIS KEYS
export const REDIS_KEYS = {
    DRIVER_GEO: (serviceAreaId) => `drivers:${serviceAreaId}`,
    DRIVER_GEO_GLOBAL: "drivers:global",
    DRIVER_META: (driverId) => `driver:meta:${driverId}`,

    BOOKING_OFFER: (bookingId) => `booking:offer:${bookingId}`,
    DRIVER_OFFERED: (driverId) => `driver:offered:${driverId}`,

    BOOKING_CANDIDATES: (bookingId) => `booking:candidates:${bookingId}`,
    BOOKING_TRIED: (bookingId) => `booking:tried:${bookingId}`,

    BOOKING_SEARCH_ACTIVE: (bookingId) => `booking:search:active:${bookingId}`,

    BOOKING_CACHE_LIST: (userId, page, limit, status, sort) =>
        `user_bookings:${userId}:${page}:${limit}:${status || "all"}:${sort}`,
    BOOKING_CACHE_DETAIL: (userId, bookingId) => `booking:${userId}:${bookingId}`,
    BOOKING_CACHE_LIST_PATTERN: (userId) => `user_bookings:${userId}:*`,
    BOOKING_ACTIVE: (userId) => `user_active_bookings:${userId}`,
    BOOKING_HISTORY: (userId, page, limit, sort) => `user_booking_history:${userId}:${page}:${limit}:${sort}`,
    BOOKING_HISTORY_PATTERN: (userId) => `user_booking_history:${userId}:*`,
};

// CACHE CONFIG
export const BOOKING_CACHE = {
    LIST_KEY: REDIS_KEYS.BOOKING_CACHE_LIST,
    DETAIL_KEY: REDIS_KEYS.BOOKING_CACHE_DETAIL,
    LIST_PATTERN: REDIS_KEYS.BOOKING_CACHE_LIST_PATTERN,
    ACTIVE_KEY: REDIS_KEYS.BOOKING_ACTIVE,
    HISTORY_KEY: REDIS_KEYS.BOOKING_HISTORY,
    HISTORY_PATTERN: REDIS_KEYS.BOOKING_HISTORY_PATTERN,
    LIST_TTL: 60,
    DETAIL_TTL: 120,
    ACTIVE_TTL: 60,
    HISTORY_TTL: 120,
};

// REDIS TTL
export const REDIS_TTL = {
    OFFER: WORKER_CONFIG.DRIVER_OFFER_TIMEOUT_SECONDS + 10,       // 70s
    DRIVER_OFFERED: WORKER_CONFIG.DRIVER_OFFER_TIMEOUT_SECONDS + 10, // 70s
    CANDIDATES: 600,
    TRIED_DRIVERS: 600,
    SEARCH_ACTIVE: 600,
    BOOKING_CACHE_LIST: 60,
    BOOKING_CACHE_DETAIL: 120,
    BOOKING_ACTIVE: 60,
    BOOKING_HISTORY: 120,
};

//  DRIVER ASSIGNMENT 
// requirement of 1km → 3km → 5km expansion with 60s per state.
export const DRIVER_ASSIGNMENT = {
    SEARCH_RADII_KM: [1, 3, 5],
    MAX_CANDIDATES_PER_SEARCH: WORKER_CONFIG.DRIVER_MAX_OFFER_ATTEMPTS,
    MAX_OFFER_ATTEMPTS: WORKER_CONFIG.DRIVER_MAX_OFFER_ATTEMPTS,
    OFFER_TIMEOUT_SECONDS: WORKER_CONFIG.DRIVER_OFFER_TIMEOUT_SECONDS,       // 60s
    OFFER_CHECK_DELAY_SECONDS: WORKER_CONFIG.DRIVER_OFFER_TIMEOUT_SECONDS + 5, // 65s
    SEARCH_RETRY_DELAY_MS: WORKER_CONFIG.DRIVER_RETRY_DELAY_MS,              // 2000ms
};

// STORE SEARCH 
export const STORE_SEARCH = {
    MAX_DISTANCE_KM: 15,
    MAX_RESULTS: 5,
    MIN_AVAILABLE_CAPACITY: 1,
};

// QUEUE NAME 
export const DRIVER_ASSIGN_QUEUE = JOB_QUEUES.DRIVER_ASSIGN;

// JOB NAMES
export const DRIVER_JOB_NAMES = {
    SEARCH_DRIVERS: "SEARCH_DRIVERS",
    OFFER_NEXT_DRIVER: "OFFER_NEXT_DRIVER",
    CHECK_OFFER_TIMEOUT: "CHECK_OFFER_TIMEOUT",
};

// AUTO-CANCEL REASONS
export const AUTO_CANCEL_REASONS = {
    NO_DRIVER_FOUND: "No drivers found in your area.",
    ALL_DRIVERS_EXHAUSTED: "All nearby drivers are unavailable at the moment.",
    DRIVER_SEARCH_FAILED: "Driver search encountered an error.",
    INVALID_LOCATION: "Invalid pickup/delivery location.",
    NO_STORE_ASSIGNED: "No store was assigned to this booking.",
};

// BOOKING STATUS GROUPS
export const CANCELLABLE_STATUSES = [
    BOOKING_STATUS.CREATED,
    BOOKING_STATUS.STORE_ASSIGNED,
    BOOKING_STATUS.DRIVER_ASSIGNED,
];

export const RETURN_REQUESTABLE_STATUSES = [
    BOOKING_STATUS.STORED,
];

export const DRIVER_SEARCH_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED,
    BOOKING_STATUS.RETURN_REQUESTED,
];

export const ACTIVE_STATUSES = Object.values(BOOKING_STATUS).filter(
    (s) => ![BOOKING_STATUS.DELIVERED, BOOKING_STATUS.CANCELLED].includes(s)
);

export const HISTORY_STATUSES = [
    BOOKING_STATUS.DELIVERED,
    BOOKING_STATUS.CANCELLED,
];

// BOOKING LIMITS
export const BOOKING_LIMITS = {
    MAX_ACTIVE_BOOKINGS: 1,
    MIN_PICKUP_LEAD_MINUTES: 15,
    MIN_RETURN_LEAD_MINUTES: 60,
    MAX_LUGGAGE_PER_TYPE: 20,
};

// DEFAULT JOB OPTIONS
export const DEFAULT_JOB_OPTIONS = {
    removeOnComplete: true,
    removeOnFail: { count: 100 },
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 5000,
    },
};

// MONGOOSE SELECT STRINGS
export const BOOKING_SELECT = {
    LIST: "bookingCode status pickupLocation deliveryLocation luggage pickup storage delivery pricing payment timeline createdAt",
    DETAIL: "-__v",
    CANCEL: "status cancelledAt cancelledBy cancelReason timeline",
    RETURN: "status delivery deliveryLocation timeline",
    ASSIGN_DRIVER: "status pickup delivery storeId userId",
    ASSIGN_STORE: "status storeId userId",
};

// API RESPONSE MESSAGES
export const BOOKING_MESSAGES = {
    PICKUP_SCHEDULED: "Pickup scheduled successfully.",
    BOOKINGS_FETCHED: "Bookings fetched successfully.",
    BOOKING_FETCHED: "Booking fetched successfully.",
    BOOKING_CANCELLED: "Booking cancelled successfully.",
    RETURN_REQUESTED: "Return requested successfully.",
    ACTIVE_FETCHED: "Active bookings fetched successfully.",
    HISTORY_FETCHED: "Booking history fetched successfully.",

    NO_STORE_AVAILABLE: "No nearby store available at the moment. Please try again later.",
    STORE_AT_CAPACITY: "All nearby stores are at full capacity. Please try again later.",
    NO_DRIVER_AVAILABLE: "No driver available at the moment. Booking has been automatically cancelled.",
    NO_DRIVER_AVAILABLE_AREA: "No drivers available in your area at the moment. Please try again later.",
    AUTO_CANCEL_RESERVE: "Your booking was automatically cancelled as no driver was available. Any payment will be refunded.",

    USER_NOT_FOUND: "User not found.",
    ACCOUNT_NOT_ACTIVE: "Your account is not active.",
    NOT_SERVICEABLE: "Your location is not in our service area.",
    BOOKING_NOT_FOUND: "Booking not found.",

    MAX_ACTIVE_REACHED: (max) => `You can have maximum ${max} active booking(s).`,
    PICKUP_TOO_SOON: (mins) => `Pickup must be scheduled at least ${mins} minutes from now.`,
    RETURN_TOO_SOON: (mins) => `Return must be scheduled at least ${mins} minutes from now.`,
    RETURN_TOO_FAR: (maxKm) => `Return location must be at most ${maxKm} km from store.`,
    CANNOT_CANCEL: (status) => `Booking cannot be cancelled in "${status}" status.`,
    CANNOT_RETURN: (status) => `Return cannot be requested in "${status}" status.`,

    SCHEDULE_FAILED: "Failed to schedule pickup.",
    FETCH_FAILED: "Failed to fetch bookings.",
    FETCH_DETAIL_FAILED: "Failed to fetch booking details.",
    CANCEL_FAILED: "Failed to cancel booking.",
    RETURN_FAILED: "Failed to request return.",
    ACTIVE_FETCH_FAILED: "Failed to fetch active bookings.",
    HISTORY_FETCH_FAILED: "Failed to fetch booking history.",
    STORE_NOT_ASSIGNED: "Store not assigned to this booking.",
    DRIVER_NOT_ASSIGNED: "No driver assigned to this booking yet.",
    ASSIGN_DRIVER: "Assigned driver details fetched successfully.",
    ASSIGN_DRIVER_FAILED: "Failed to fetch assigned driver details.",
    ASSIGN_STORE_DETAILS: "Assigned store details fetched successfully.",
    GET_ASSIGN_STORE_FAILED: "Failed to fetch assigned store details.",
};

export const BOOKING_JOB_NAMES = {
    FIND_DRIVER: "FIND_DRIVER",
    NOTIFY_DRIVERS: "NOTIFY_DRIVERS",
    BOOKING_CANCELLED: "BOOKING_CANCELLED",
    PROCESS_RETURN: "PROCESS_RETURN",
    DRIVER_SEARCH_TIMEOUT: "DRIVER_SEARCH_TIMEOUT",
};