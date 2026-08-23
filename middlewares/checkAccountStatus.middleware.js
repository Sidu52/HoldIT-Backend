import { Admin, User, Driver, Store, StoreOwner } from "../models/index.js";
import { ACCOUNT_STATUS, STATUS_CODES } from "../utils/constants.js";
import { sendError } from "../utils/apiResponse.js";
import { cacheAside } from "../constants/redis/redisOperation.js";
import { AdminKeys, AdminTTL } from "../constants/redis/admin.keys.js";
import { UserKeys, UserTTL } from "../constants/redis/user.keys.js";
import { DriverKeys, DriverTTL } from "../constants/redis/driver.keys.js";
import { StoreKeys, StoreTTL } from "../constants/redis/store.keys.js";
import { StoreOwnerKeys, StoreOwnerTTL } from "../constants/redis/storeOwner.keys.js";

export const checkAdminAccountStatus = async (req, res, next) => {
    try {
        const { auth_id } = req.user;
        const admin = await cacheAside(
            AdminKeys.profile(auth_id),
            AdminTTL.PROFILE,
            () => Admin.findById(auth_id).select("-password_hash -__v").lean()
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
            () => User.findById(auth_id).select("-__v").lean()
        );
        if (!user || user.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your account is no longer active. Please contact support.", STATUS_CODES.FORBIDDEN);
        }
        next();
    } catch (err) {
        return sendError(res, "Failed to verify account status", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};

export const checkDriverAccountStatus = async (req, res, next) => {
    try {
        const { auth_id } = req.user;
        const driver = await cacheAside(
            DriverKeys.profile(auth_id),
            DriverTTL.PROFILE,
            () => Driver.findById(auth_id).select("-__v").lean()
        );
        if (!driver || driver.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your account is no longer active. Please contact support.", STATUS_CODES.FORBIDDEN);
        }
        next();
    } catch (err) {
        return sendError(res, "Failed to verify account status", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};

export const checkStoreAccountStatus = async (req, res, next) => {
    try {
        const { auth_id } = req.user;
        const store = await cacheAside(
            StoreKeys.profile(auth_id),
            StoreTTL.PROFILE,
            () => Store.findById(auth_id).select("-__v").lean()
        );
        if (!store || store.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your store account is no longer active. Please contact support.", STATUS_CODES.FORBIDDEN);
        }
        next();
    } catch (err) {
        return sendError(res, "Failed to verify account status", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};

export const checkStoreOwnerAccountStatus = async (req, res, next) => {
    try {
        const { auth_id } = req.user;
        const owner = await cacheAside(
            StoreOwnerKeys.profile(auth_id),
            StoreOwnerTTL.PROFILE,
            () => StoreOwner.findById(auth_id).select("-password_hash -__v").lean()
        );
        if (!owner || owner.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your account is no longer active. Please contact support.", STATUS_CODES.FORBIDDEN);
        }
        next();
    } catch (err) {
        return sendError(res, "Failed to verify account status", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};