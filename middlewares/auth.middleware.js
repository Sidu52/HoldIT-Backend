import jwt from "jsonwebtoken";
import { sendResponse, sendError } from "../utils/apiResponse.js";
import { STATUS_CODES, TOKEN_TYPES, USER_ROLES } from "../utils/constants.js";

export const authMiddleware = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return sendError(
        res,
        "Authentication required",
        STATUS_CODES.UNAUTHORIZED
      );
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decoded.type !== TOKEN_TYPES.ACCESS) {
      return sendError(
        res,
        "Invalid token type",
        STATUS_CODES.UNAUTHORIZED
      );
    }
    req.user = decoded;
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Token has expired"
        : "Invalid or expired token";

    return sendError(
      res,
      message,
      STATUS_CODES.UNAUTHORIZED
    );
  }
};

/**
 * Higher-order middleware to restrict access by role
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(
        res,
        "Authentication required",
        STATUS_CODES.UNAUTHORIZED
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        "You do not have permission to perform this action",
        STATUS_CODES.FORBIDDEN
      );
    }

    next();
  };
};

// Specialized Protectors
export const protectAdmin = authorize(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN);
export const protectUser = authorize(USER_ROLES.USER);
export const protectDriver = authorize(USER_ROLES.DRIVER);
export const protectStore = authorize(USER_ROLES.STORE);
export const protectStoreOwner = authorize(USER_ROLES.STORE_OWNER);


const extractToken = (req) => {
  // Priority: Authorization header > Cookie
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  // Determine correct cookie name based on request path
  const path = req.originalUrl || req.url || "";
  let cookieName = "accessToken";
  if (path.includes("/admin")) cookieName = "admin_accessToken";

  // Fallback to cookie
  if (req.cookies?.[cookieName]) {
    return req.cookies[cookieName];
  }
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};

