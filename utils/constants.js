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
  USER: "user",
  DRIVER: "driver",
  STORE_KEEPER: "store_keeper",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  PENDING: 'pending',
  BLOCKED: 'blocked',
  INACTIVE: 'inactive',
};

const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  INVITE: 'invite',
};

const INVITE_TOKEN_EXPIRY = 1 * 60 * 60; // 1 hours in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const ACCESS_TOKEN_EXPIRY = 1 * 60; // 15 minutes in seconds

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
};

