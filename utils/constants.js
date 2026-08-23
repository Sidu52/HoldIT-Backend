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
  CREATED: "created",                       // validated, order not yet created
  PAYMENT_PENDING: "payment_pending",       // advance Razorpay order created, awaiting capture
  STORE_ASSIGNED: "store_assigned",         // advance captured, store reserved
  DRIVER_ASSIGNED: "driver_assigned",
  DRIVER_ARRIVED: "driver_arrived",
  PICKED_UP: "picked_up",
  AT_STORE: "at_store",
  STORED: "stored",
  RETURN_REQUESTED: "return_requested",           // user requested return
  FINAL_PAYMENT_PENDING: "final_payment_pending", // final Razorpay order created, awaiting capture
  FINAL_PAYMENT_CAPTURED: "final_payment_captured", // final captured, return driver dispatched
  RETURN_DRIVER_ASSIGNED: "return_driver_assigned", // final captured, return driver dispatched
  OUT_FOR_RETURN: "out_for_return",
  ARRIVED_FOR_DELIVERY: "arrived_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  DRIVER_CANCELLED_CRITICAL: "driver_cancelled_critical",
});

export const JOB_QUEUES = Object.freeze({
  BOOKING_AUTO_CANCEL: "booking-auto-cancel",
  ASSIGN_STORE_AND_DISPATCH: "assign-store-and-dispatch",
  DRIVER_ASSIGN: "driver-assign",
  
  DELETE_UNVERIFIED_USER: "delete-unverified-user",
  DELETE_UNVERIFIED_DRIVER: "delete-unverified-driver",
  DELETE_UNVERIFIED_STORE: "delete-unverified-store",
  BOOKING_CANCELLED: "booking-cancelled",
  RETURN_PROCESS: "return-process",
  DISPATCH_RETURN_DRIVER: "dispatch-return-driver",
  PAYMENT_FOLLOWUP: "payment-followup",

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


// OTP CONFIGURATION
export const OTP_LENGTH = 4;               // seconds between resend requests
export const OTP_MAX_ATTEMPTS = 5;                 // max failed verifications before lockout
export const OTP_FAIL_WINDOW_SECONDS = 15 * 60;    // 15-minute fail-lockout window
export const OTP_MAX_REQUESTS_PER_HOUR = 5;        // max OTP sends per rate-limit window
export const BCRYPT_SALT_ROUNDS = 10;
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

// SUPPORT TICKET & LIVE/BOT CHAT
export const TICKET_STATUS = Object.freeze({
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  PENDING: "pending",
  AWAITING_USER: "awaiting_user",
  AWAITING_ADMIN: "awaiting_admin",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

export const CHAT_TYPE = Object.freeze({
  TICKET: "TICKET",
  BOT_CHAT: "BOT_CHAT",
  LIVE_CHAT: "LIVE_CHAT",
});

export const REQUESTER_MODEL = Object.freeze({
  USER: "User",
  DRIVER: "Driver",
  STORE: "Store",
  STORE_OWNER: "StoreOwner",
});

export const SENDER_MODEL = Object.freeze({
  USER: "User",
  DRIVER: "Driver",
  STORE: "Store",
  STORE_OWNER: "StoreOwner",
  ADMIN: "Admin",
  BOT: "Bot",
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
  TECHNICAL: "technical",
  EARNINGS: "earnings",
  OTHER: "other",
});

export const GENDER_OPTIONS = ["male", "female", "other"];

// VEHICLE
export const VEHICLE_TYPES = {
  CAR: "car",
  BIKE: "bike",
  MOTORCYCLE: "motorcycle",
  CYCLE: "cycle",
  SCOOTER: "scooter",
};

// WORKER CONFIGURATION
export const WORKER_CONFIG = {
  // Driver assignment
  DRIVER_OFFER_TIMEOUT_SECONDS: 60,
  DRIVER_MAX_OFFER_ATTEMPTS: 10,
  DRIVER_RETRY_DELAY_MS: 2000,
};
