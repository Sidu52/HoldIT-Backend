// STATUS CODES
const STATUS_CODES = {
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

const JOB_QUEUES = {
  STORE_ASSIGN: "store-assign",
  DRIVER_ASSIGN: "driver-assign",
  BOOKING_AUTO_CANCEL: "booking-auto-cancel",
  DELETE_UNVERIFIED_USER: "delete-unverified-user",
  DELETE_UNVERIFIED_DRIVER: "delete-unverified-driver",
  BOOKING_CANCELLED: "booking-cancelled",
  RETURN_PROCESS: "return-process",
};

// SUPPORT TICKET
const TICKET_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  AWAITING_USER: "AWAITING_USER",
  AWAITING_ADMIN: "AWAITING_ADMIN",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
};

const TICKET_PRIORITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
};

const TICKET_CATEGORY = {
  BOOKING_ISSUE: "BOOKING_ISSUE",
  PAYMENT_ISSUE: "PAYMENT_ISSUE",
  DRIVER_COMPLAINT: "DRIVER_COMPLAINT",
  STORE_COMPLAINT: "STORE_COMPLAINT",
  LUGGAGE_DAMAGE: "LUGGAGE_DAMAGE",
  LUGGAGE_LOST: "LUGGAGE_LOST",
  APP_BUG: "APP_BUG",
  ACCOUNT_ISSUE: "ACCOUNT_ISSUE",
  REFUND_REQUEST: "REFUND_REQUEST",
  GENERAL_INQUIRY: "GENERAL_INQUIRY",
  OTHER: "OTHER",
};


// USER & ROLE MANAGEMENT
const USER_ROLES = {
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  OPERATION_MANAGER: "operation_manager",
  CUSTOMER_SUPPORT: "customer_support",
};

const ACCOUNT_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  BLOCKED: "blocked",
  INACTIVE: "inactive",
};

const GENDER_OPTIONS = ["male", "female", "other"];

// AUTHENTICATION & TOKENS
const TOKEN_TYPES = {
  ACCESS: "access",
  REFRESH: "refresh",
  INVITE: "invite",
};

const ACCESS_TOKEN_EXPIRY = 60 * 60;     // 60 minutes (used as `${val}m`)
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60;     // 7 days (used as `${val}d`)
const INVITE_TOKEN_EXPIRY = 24;     // 24 hours (used as `${val}h`)

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 100;

// OTP CONFIGURATION
const OTP_LENGTH = 4;
const OTP_EXPIRY = 5;                         // 5 minutes
const OTP_MAX_ATTEMPTS = 5;                   // Max verification attempts per OTP
const OTP_COOLDOWN = 60;                      // Seconds before requesting new OTP
const OTP_MAX_REQUESTS_PER_HOUR = 5;          // Max OTP requests per hour per user

// RATE LIMITING
const RATE_LIMIT = {
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MINUTES: 15,
  API_MAX_REQUESTS: 100,
  API_WINDOW_MINUTES: 15,
};

// BOOKING STATUS
const BOOKING_STATUS = {
  CREATED: "created",
  STORE_ASSIGNED: "store_assigned",
  DRIVER_SEARCH: "driver_search",
  PICKUP_IN_PROGRESS: "pickup_in_progress",
  RETURN_DRIVER_ASSIGNED: "return_driver_assigned",
  RETURN_IN_PROGRESS: "return_in_progress",
  DRIVER_ASSIGNED: "driver_assigned",
  DRIVER_ARRIVED: "driver_arrived",
  PICKED_UP: "picked_up",
  STORED: "stored",
  RETURN_REQUESTED: "return_requested",
  OUT_FOR_RETURN: "out_for_return",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

const ASSIGNMENT_TYPES = {
  PICKUP: "PICKUP",
  DELIVERY: "DELIVERY",
  RETURN: "RETURN",
};

// VERIFICATION & ONBOARDING
const VERIFICATION_STATUS = {
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
};

const ON_BOARDING_STATUS = {
  DEMO: "demo",
  DOCUMENTS_PENDING: "documents_pending",
  ACTIVE: "active",
};

// VEHICLE
const VEHICLE_TYPES = {
  CAR: "car",
  BIKE: "bike",
  MOTORCYCLE: "motorcycle",
  CYCLE: "cycle",
  SCOOTER: "scooter",
};

// WORKER CONFIGURATION
const WORKER_CONFIG = {
  STORE_SEARCH_RADIUS_KM: 50,
  STORE_MAX_RETRY: 3,
  STORE_RETRY_DELAY_MS: 5000,

  // Driver assignment
  DRIVER_SEARCH_RADIUS_KM: 10,
  DRIVER_SEARCH_TIMEOUT_MINUTES: 15,
  DRIVER_OFFER_TIMEOUT_SECONDS: 60,
  DRIVER_MAX_RETRY_ROUNDS: 3,
  DRIVER_RETRY_DELAY_MS: 30000,

  // Auto cancel
  AUTO_CANCEL_DELAY_MINUTES: 15,
};

export {
  JOB_QUEUES,
  STATUS_CODES,
  WORKER_CONFIG,
  USER_ROLES,
  ACCOUNT_STATUS,
  GENDER_OPTIONS,
  TOKEN_TYPES,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  INVITE_TOKEN_EXPIRY,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  OTP_LENGTH,
  OTP_EXPIRY,
  OTP_MAX_ATTEMPTS,
  OTP_COOLDOWN,
  OTP_MAX_REQUESTS_PER_HOUR,
  RATE_LIMIT,
  BOOKING_STATUS,
  ASSIGNMENT_TYPES,
  VERIFICATION_STATUS,
  ON_BOARDING_STATUS,
  VEHICLE_TYPES,
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_CATEGORY,
};