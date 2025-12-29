import { sendResponse } from "../utils/apiResponse.js";

export const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return sendResponse({
        res,
        message: "Unauthorized",
        statusCode: 401
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return sendResponse({
        res,
        message: "Forbidden: Access denied",
        statusCode: 403
      });
    }

    next();
  };
};
