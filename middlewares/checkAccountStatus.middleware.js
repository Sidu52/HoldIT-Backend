import { Admin, User } from "../models/index.js";
import { ACCOUNT_STATUS, STATUS_CODES } from "../utils/constants.js";
import { sendError } from "../utils/apiResponse.js";
import { cacheAside } from "../constants/redis/redisOperation.js";
import { AdminKeys, AdminTTL } from "../constants/redis/admin.keys.js";
import { UserKeys, UserTTL } from "../constants/redis/user.keys.js";

export const checkAdminAccountStatus = async (req, res, next) => {
    try {
        const { auth_id } = req.user;
        const admin = await cacheAside(
            AdminKeys.profile(auth_id),
            AdminTTL.PROFILE,
            () => Admin.findById(auth_id).select("_id account_status").lean()
        );
        if (!admin || admin.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your account is no longer active. Please contact support.", STATUS_CODES.FORBIDDEN);
        }
        next();
    } catch (err) {
        return sendError(res, "Failed to verify account status", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};

export const checkUserAccountStatus = async (req, res, next) => {
    try {
        const { auth_id } = req.user;
        const user = await cacheAside(
            UserKeys.profile(auth_id),
            UserTTL.PROFILE,
            () => User.findById(auth_id).select("_id account_status").lean()
        );
        if (!user || user.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your account is no longer active. Please contact support.", STATUS_CODES.FORBIDDEN);
        }
        next();
    } catch (err) {
        return sendError(res, "Failed to verify account status", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};  