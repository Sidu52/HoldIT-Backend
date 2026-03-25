import mongoose from "mongoose";
import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";

// Validates that any URL parameter ending in 'id' is a valid MongoDB ObjectId
export const validateObjectIdParams = (req, res, next) => {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    
    for (const [key, value] of Object.entries(req.params)) {
        if (key.toLowerCase().endsWith("id")) {
            if (!mongoose.Types.ObjectId.isValid(value) || !objectIdPattern.test(String(value))) {
                return sendResponse({
                    res,
                    statusCode: STATUS_CODES.BAD_REQUEST,
                    message: `Invalid identity format for parameter: ${key}`
                });
            }
        }
    }
    next();
};

// Enforces a hard cap of 100 on pagination queries to prevent DB overload
export const enforcePaginationLimit = (req, res, next) => {
    if (req.query && req.query.limit) {
        const limit = parseInt(req.query.limit, 10);
        if (!isNaN(limit) && limit > 100) {
            req.query.limit = "100";
        }
    }
    next();
};
