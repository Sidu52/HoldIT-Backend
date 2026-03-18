import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";

export const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user?.role) {
      return sendResponse({
        res,
        message: "Authentication required",
        statusCode: STATUS_CODES.UNAUTHORIZED,
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendResponse({
        res,
        message: "Insufficient permissions",
        statusCode: STATUS_CODES.FORBIDDEN,
      });
    }

    next();
  };
};


