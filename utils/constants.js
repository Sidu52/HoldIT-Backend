// Status Codes
const STATUS_CODES = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// User Roles
const USER_ROLES = {
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  OPERATION_MANAGER: "operation_manager",
  CUSTOMER_SUPPORT: "customer_support"
};

const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  PENDING: 'pending',
  BLOCKED: 'blocked',
  INACTIVE: 'inactive',
};

const BOOKING_STATUS = {
  CREATED: 'created',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ARRIVED: 'driver_arrived',
  PICKED_UP: 'picked_up',
  STORED: 'stored',
  RETURN_REQUESTED: 'return_requested',
  OUT_FOR_RETURN: 'out_for_return',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

const VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
}

const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  INVITE: 'invite',
};

const ASSIGNMENT_TYPES = {
  PICKUP: 'PICKUP',
  DELIVERY: 'DELIVERY',
  RETURN: 'RETURN',
}

const ON_BOARDING_STATUS = {
  DEMO: 'demo',
  DOCUMENTS_PENDING: 'documents_pending',
  ACTIVE: 'active',
}

const VEHICLE_TYPES = {
  CAR: 'car',
  bIKE: 'bike',
  MOTORCYCLE: 'motorcycle',
  CYCLE: 'cycle',
  SCOOTER: 'scooter',
};

const INVITE_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 100;

const GENDER_OPTIONS = ['male', 'female', 'other', 'prefer_not_to_say'];

export {
  STATUS_CODES,
  USER_ROLES,
  ACCOUNT_STATUS,
  TOKEN_TYPES,
  INVITE_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  ACCESS_TOKEN_EXPIRY,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  GENDER_OPTIONS,
  ASSIGNMENT_TYPES,
  BOOKING_STATUS,
  VERIFICATION_STATUS,
  ON_BOARDING_STATUS,
  VEHICLE_TYPES,
};

