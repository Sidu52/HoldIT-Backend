import jwt from "jsonwebtoken";
import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES, TOKEN_TYPES } from "../utils/constants.js";

export const authMiddleware = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return sendResponse({
        res,
        message: "Authentication required",
        statusCode: STATUS_CODES.UNAUTHORIZED,
      });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decoded.type !== TOKEN_TYPES.ACCESS) {
      return sendResponse({
        res,
        message: "Invalid token type",
        statusCode: STATUS_CODES.UNAUTHORIZED,
      });
    }
    req.user = decoded;
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Token has expired"
        : "Invalid or expired token";

    return sendResponse({
      res,
      message,
      statusCode: STATUS_CODES.UNAUTHORIZED,
    });
  }
};


const extractToken = (req) => {
  // Priority: Authorization header > Cookie
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  // Fallback to cookie
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};
