import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";
import logger from "../utils/logger.js";


const errorHandler = (err, req, res, next) => {
  // Log full error for debugging
  logger.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method,
  });

  // Handle specific error types
  // JWT Errors
  if (err.name === "JsonWebTokenError") {
    return sendResponse({
      res,
      message: "Invalid token",
      statusCode: STATUS_CODES.UNAUTHORIZED,
    });
  }

  if (err.name === "TokenExpiredError") {
    return sendResponse({
      res,
      message: "Token has expired",
      statusCode: STATUS_CODES.UNAUTHORIZED,
    });
  }

  // Mongoose Validation Error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return sendResponse({
      res,
      message: "Validation failed",
      statusCode: STATUS_CODES.BAD_REQUEST,
      data: { errors },
    });
  }

  // Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return sendResponse({
      res,
      message: `Duplicate value for field: ${field}`,
      statusCode: STATUS_CODES.CONFLICT,
    });
  }

  // Mongoose Cast Error (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    return sendResponse({
      res,
      message: `Invalid value for ${err.path}`,
      statusCode: STATUS_CODES.BAD_REQUEST,
    });
  }

  // Default error
  const statusCode = err.statusCode || STATUS_CODES.INTERNAL_SERVER_ERROR;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  return sendResponse({
    res,
    message,
    statusCode,
  });
};

export default errorHandler;