// STATUS CODES
export const STATUS_CODES = Object.freeze({
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
});

// USER & ROLE MANAGEMENT
export const USER_ROLES = Object.freeze({
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  OPERATION_MANAGER: "operation_manager",
  CUSTOMER_SUPPORT: "customer_support",
  DRIVER: "driver",
  STORE: "store",
  STORE_OWNER: "store_owner",
  USER: "user",
});

export const ROLES = Object.freeze({
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  OPERATION_MANAGER: "operation_manager",
  CUSTOMER_SUPPORT: "customer_support",
});

export const ADDRESS_TYPE_OPTIONS = [
  "Home",
  "Office",
  "Other",
];

// BOOKING STATUS
export const BOOKING_STATUS = Object.freeze({
  CREATED: "created",
  STORE_ASSIGNED: "store_assigned",
  DRIVER_ASSIGNED: "driver_assigned",
  DRIVER_ARRIVED: "driver_arrived",
  PICKED_UP: "picked_up",
  AT_STORE: "at_store",
  STORED: "stored",
  RETURN_REQUESTED: "return_requested",
  RETURN_DRIVER_ASSIGNED: "return_driver_assigned",
  OUT_FOR_RETURN: "out_for_return",
  ARRIVED_FOR_DELIVERY: "arrived_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  DRIVER_CANCELLED_CRITICAL: "driver_cancelled_critical",
});

export const JOB_QUEUES = Object.freeze({
  STORE_ASSIGN: "store-assign",
  DRIVER_ASSIGN: "driver-assign",
  BOOKING_AUTO_CANCEL: "booking-auto-cancel",
  DELETE_UNVERIFIED_USER: "delete-unverified-user",
  DELETE_UNVERIFIED_DRIVER: "delete-unverified-driver",
  DELETE_UNVERIFIED_STORE: "delete-unverified-store",
  BOOKING_CANCELLED: "booking-cancelled",
  RETURN_PROCESS: "return-process",
});

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: "active",
  PENDING: "pending",
  INACTIVE: "inactive",
  BLOCKED: "blocked",
});

// VERIFICATION
export const VERIFICATION_STATUS = Object.freeze({
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
  PROFILE_COMPLETE: "profile_complete",
});

// CACHE TTL (seconds)
export const CACHE_TTL = Object.freeze({
  LIST: 120,
  DETAIL: 300,
  DASHBOARD: 300,
  STORE: 300,
});

export const DETAIL_CACHE_TTL = 300;     // 5 minutes
export const STORES_CACHE_TTL = 120;     // 2 minutes
export const DASHBOARD_CACHE_TTL = 300;  // 5 minutes

// OTP CONFIGURATION
export const OTP_LENGTH = 4;
export const OTP_EXPIRY = 10;                      // minutes — OTP valid for 10 mins
export const OTP_COOLDOWN = 60;                    // seconds between resend requests
export const OTP_MAX_ATTEMPTS = 5;                 // max failed verifications before lockout
export const OTP_FAIL_WINDOW_SECONDS = 15 * 60;    // 15-minute fail-lockout window
export const OTP_MAX_REQUESTS_PER_HOUR = 5;        // max OTP sends per rate-limit window

// Kept for backward compatibility (REDIS_TTL.OTP uses this)
export const OTP_CONFIG = Object.freeze({
  EXPIRY_MINUTES: OTP_EXPIRY,
});

export const REDIS_TTL = Object.freeze({
  PENDING_USER: 20 * 60,
  OTP: OTP_EXPIRY * 60,
});

// PASSWORD CONFIGURATION
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// TOKEN CONFIGURATION
export const TOKEN_TYPES = Object.freeze({
  ACCESS: "access",
  REFRESH: "refresh",
});

export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// UNVERIFIED ACCOUNT CLEANUP DELAY
export const UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

// SUPPORT TICKET
export const TICKET_STATUS = Object.freeze({
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  AWAITING_USER: "awaiting_user",
  AWAITING_ADMIN: "awaiting_admin",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const TICKET_PRIORITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
});

export const TICKET_CATEGORY = Object.freeze({
  BOOKING: "booking",
  PAYMENT: "payment",
  STORE: "store",
  DRIVER: "driver",
  ACCOUNT: "account",
  OTHER: "other",
});

const GENDER_OPTIONS = ["male", "female", "other"];

// VEHICLE
const VEHICLE_TYPES = {
  CAR: "car",
  BIKE: "bike",
  MOTORCYCLE: "motorcycle",
  CYCLE: "cycle",
  SCOOTER: "scooter",
};

// WORKER CONFIGURATION
export const WORKER_CONFIG = {
  STORE_SEARCH_RADIUS_KM: 50,
  STORE_MAX_RETRY: 3,
  STORE_RETRY_DELAY_MS: 5000,

  // Driver assignment
  DRIVER_OFFER_TIMEOUT_SECONDS: 60,
  DRIVER_MAX_OFFER_ATTEMPTS: 10,
  DRIVER_RETRY_DELAY_MS: 2000,
};

export {
  GENDER_OPTIONS,
  VEHICLE_TYPES,
};