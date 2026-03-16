import { BOOKING_STATUS } from "../../utils/constants.js";

export const REDIS_KEYS = {
    DRIVER_GEO: (serviceAreaId) => `drivers:${serviceAreaId}`,
    DRIVER_GEO_GLOBAL: "drivers:global",
    DRIVER_META: (driverId) => `driver:meta:${driverId}`,

    BOOKING_OFFER: (bookingId) => `booking:offer:${bookingId}`,
    DRIVER_OFFERED: (driverId) => `driver:offered:${driverId}`,
    BOOKING_CANDIDATES: (bookingId) => `booking:candidates:${bookingId}`,
    BOOKING_TRIED: (bookingId) => `booking:tried:${bookingId}`,

    BOOKING_DRIVER_SEARCH_ACTIVE: (bookingId) => `booking:driver_search:${bookingId}`,
};


export const STORE_SEARCH = {
    MAX_DISTANCE_KM: 15,
    MAX_RESULTS: 5,
    MIN_AVAILABLE_CAPACITY: 1,
};

export const REDIS_TTL = {
    OFFER: 65,
    DRIVER_OFFERED: 65,
    CANDIDATES: 600,
    TRIED_DRIVERS: 600,
    DRIVER_SEARCH_ACTIVE: 600,
};

export const DRIVER_ASSIGNMENT = {
    SEARCH_RADII_KM: [3, 5, 8],
    MAX_CANDIDATES_PER_SEARCH: 10,
    MAX_OFFER_ATTEMPTS: 5,
    OFFER_TIMEOUT_SECONDS: 60,
    OFFER_CHECK_DELAY_SECONDS: 65,
    SEARCH_RETRY_DELAY_MS: 2000,
};

export const DRIVER_SEARCH = {
    MAX_DISTANCE_KM: 10,
    SEARCH_ROUNDS: 3,
    ROUND_DELAY_MS: 10000,
    NOTIFICATION_EXPIRY_SECONDS: 60,
    ACCEPTANCE_WAIT_MS: 60000,
};


export const BOOKING_JOB_NAMES = {
    FIND_DRIVER: "FIND_DRIVER",
    NOTIFY_DRIVERS: "NOTIFY_DRIVERS",
    BOOKING_CANCELLED: "BOOKING_CANCELLED",
    PROCESS_RETURN: "PROCESS_RETURN",
    DRIVER_SEARCH_TIMEOUT: "DRIVER_SEARCH_TIMEOUT",
};

export const BOOKING_CACHE = {
    LIST_KEY: (userId, page, limit, status, sort) =>
        `user_bookings:${userId}:${page}:${limit}:${status || "all"}:${sort}`,
    DETAIL_KEY: (userId, bookingId) => `booking:${userId}:${bookingId}`,
    LIST_PATTERN: (userId) => `user_bookings:${userId}:*`,
    LIST_TTL: 60,       // 1 minute
    DETAIL_TTL: 120,    // 2 minutes
};

export const BOOKING_LIMITS = {
    MAX_ACTIVE_BOOKINGS: 1,
    MIN_PICKUP_LEAD_MINUTES: 15,
    MIN_RETURN_LEAD_MINUTES: 60,
    MAX_LUGGAGE_PER_TYPE: 20,
};

export const CANCELLABLE_STATUSES = [
    BOOKING_STATUS.CREATED,
    BOOKING_STATUS.STORE_ASSIGNED,
    BOOKING_STATUS.DRIVER_SEARCH,
    BOOKING_STATUS.DRIVER_ASSIGNED,
];

export const RETURN_REQUESTABLE_STATUSES = [
    BOOKING_STATUS.STORED,
];

export const ACTIVE_STATUSES = Object.values(BOOKING_STATUS).filter(
    (s) => ![BOOKING_STATUS.DELIVERED, BOOKING_STATUS.CANCELLED].includes(s)
);

export const HISTORY_STATUSES = [
    BOOKING_STATUS.DELIVERED,
    BOOKING_STATUS.CANCELLED,
];

export const DEFAULT_JOB_OPTIONS = {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 5000,
    },
};

export const BOOKING_SELECT = {
    LIST: "bookingCode status pickupLocation luggage pickup storage delivery pricing payment timeline createdAt",
    DETAIL: "-__v",
    CANCEL: "status cancelledAt cancelledBy cancelReason timeline",
    RETURN: "status delivery deliveryLocation timeline",
};

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
    AUTO_CANCELLED_REFUND: "Your booking was automatically cancelled as no driver was available. Any payment will be refunded.",
    USER_NOT_FOUND: "User not found.",
    ACCOUNT_NOT_ACTIVE: "Your account is not active.",
    NOT_SERVICEABLE: "Your location is not in our service area.",
    BOOKING_NOT_FOUND: "Booking not found.",
    MAX_ACTIVE_REACHED: (max) => `You can have maximum ${max} active booking(s).`,
    PICKUP_TOO_SOON: (mins) => `Pickup must be scheduled at least ${mins} minutes from now.`,
    RETURN_TOO_SOON: (mins) => `Return must be scheduled at least ${mins} minutes from now.`,
    CANNOT_CANCEL: (status) => `Booking cannot be cancelled in "${status}" status.`,
    CANNOT_RETURN: (status) => `Return cannot be requested in "${status}" status.`,
    SCHEDULE_FAILED: "Failed to schedule pickup.",
    FETCH_FAILED: "Failed to fetch bookings.",
    FETCH_DETAIL_FAILED: "Failed to fetch booking details.",
    CANCEL_FAILED: "Failed to cancel booking.",
    RETURN_FAILED: "Failed to request return.",
    ACTIVE_FETCH_FAILED: "Failed to fetch active bookings.",
    HISTORY_FETCH_FAILED: "Failed to fetch booking history.",
};

export const AUTO_CANCEL_REASONS = {
    NO_DRIVER_FOUND: "No drivers found in your area.",
    ALL_DRIVERS_EXHAUSTED: "All nearby drivers are unavailable at the moment.",
    DRIVER_SEARCH_FAILED: "Driver search encountered an error.",
    INVALID_LOCATION: "Invalid pickup/delivery location.",
    NO_STORE_ASSIGNED: "No store was assigned to this booking.",
};

export const DRIVER_JOB_NAMES = {
    SEARCH_DRIVERS: "SEARCH_DRIVERS",
    OFFER_NEXT_DRIVER: "OFFER_NEXT_DRIVER",
    CHECK_OFFER_TIMEOUT: "CHECK_OFFER_TIMEOUT",
};

export const DRIVER_ASSIGN_QUEUE = "driver-assign";

export const DRIVER_SEARCH_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED,
    BOOKING_STATUS.DRIVER_SEARCH,
];