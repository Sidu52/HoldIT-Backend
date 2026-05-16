import { STATUS_CODES } from "../../utils/constants.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import StoreOwner from "../../models/StoreOwner.js";
import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import logger from "../../utils/logger.js";


export const getMe = async (req, res) => {
    try {
        const { role } = req.user;
        const userId = req.user.auth_id;

        let user;
        if (role === "user") {
            user = await User.findById(userId).select("-password");
        } else if (role === "store") {
            user = await Store.findById(userId).select("-password");
        } else if (role === "store_owner") {
            user = await StoreOwner.findById(userId).select("-password");
        } else if (role === "driver") {
            user = await Driver.findById(userId).select("-password");
        }

        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({ res, message: "User fetched successfully", data: { ...user.toObject(), role } });
    } catch (err) {
        logger.error("Get Me Error:", err);
        return sendError(res, "Failed to fetch user");
    }
};