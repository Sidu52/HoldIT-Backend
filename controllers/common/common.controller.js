import { STATUS_CODES } from "../../utils/constants.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import StoreOwner from "../../models/StoreOwner.js";
import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import logger from "../../utils/logger.js";

const EXCLUDED_FIELDS = "-password_hash -__v";

const MODEL_MAP = {
    user: User,
    store: Store,
    store_owner: StoreOwner,
    driver: Driver,
};

export const getMe = async (req, res) => {
    try {
        const { role, auth_id: userId } = req.user;

        const Model = MODEL_MAP[role];
        if (!Model) {
            return sendError(res, "Invalid role", STATUS_CODES.BAD_REQUEST);
        }

        const user = await Model.findById(userId).select(EXCLUDED_FIELDS).lean();

        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({ res, message: "User fetched successfully", data: { ...user, role } });
    } catch (err) {
        logger.error("Get Me Error:", err);
        return sendError(res, "Failed to fetch user");
    }
};