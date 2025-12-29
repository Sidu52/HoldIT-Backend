import jwt from "jsonwebtoken";
import { sendError, sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.cookies.accessToken;

    if (!authHeader) {
      return sendResponse({
        res,
        message: "Unauthorized 1",
        statusCode: STATUS_CODES.UNAUTHORIZED
      });
    }

    const decoded = jwt.verify(authHeader, process.env.ACCESS_TOKEN_SECRET);
    if (!decoded) {
      return sendResponse({
        res,
        message: "Invalid or expired token",
        statusCode: STATUS_CODES.UNAUTHORIZED
      });
    }

    req.user = decoded;
    next();

  } catch (err) {
    console.error("JWT Error:", err.message);

    return sendResponse({
      res,
      message: "Invalid or expired token",
      statusCode: STATUS_CODES.UNAUTHORIZED
    });
  }
};

export const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    console.log("object", req.user);
    if (!req.user || !req.user.role) {
      return sendResponse({
        res,
        message: "Unauthorized2",
        statusCode: STATUS_CODES.UNAUTHORIZED
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return sendResponse({
        res,
        message: "Forbidden: Access denied",
        statusCode: STATUS_CODES.FORBIDDEN
      });
    }

    next();
  };
};