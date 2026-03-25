import User from "../../models/User.js";
import Driver from "../../models/Driver.js";
import StoreOwner from "../../models/StoreOwner.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, ACCOUNT_STATUS, USER_ROLES, REFRESH_TOKEN_EXPIRY, ACCESS_TOKEN_EXPIRY, TOKEN_TYPES } from "../../utils/constants.js";
import { set, get, del } from "../../services/redisService.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/token.js";
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import Admin from "../../models/Admin.js";
import logger from "../../utils/logger.js";


// Refresh Token
export const refresh = async (req, res, role) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return sendError(res, "Refresh token missing", STATUS_CODES.UNAUTHORIZED);
        }
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

        if (decoded.type !== TOKEN_TYPES.REFRESH) {
            return sendError(res, "Invalid refresh token", STATUS_CODES.UNAUTHORIZED);
        }

        const redisKey = `refresh:${decoded.auth_id}:${decoded.token_id}`;
        const exists = await get(redisKey);
        if (!exists) {
            return sendError(res, "Token reuse detected", STATUS_CODES.FORBIDDEN);
        }
        const models = {
            [USER_ROLES.ADMIN]: Admin,
            [USER_ROLES.SUPER_ADMIN]: Admin,
            [USER_ROLES.USER]: User,
            [USER_ROLES.DRIVER]: Driver,
            [USER_ROLES.STORE_KEEPER]: StoreOwner,
        };
        const Model = models[role];
        let authUser;
        if (!Model) return sendError(res, "Invalid role", STATUS_CODES.BAD_REQUEST);
        else if (models[role] === Admin) {
            authUser = await Admin.findById(decoded.auth_id).lean();
        }
        else {
            authUser = await Model.findOne({ auth_user_id: decoded.auth_id }).lean();
        }

        if (!authUser) {
            return sendError(res, "Unauthorized", STATUS_CODES.UNAUTHORIZED);
        } else if (authUser.status === ACCOUNT_STATUS.INACTIVE || authUser.status === ACCOUNT_STATUS.BLOCKED) {
            return sendError(res, "Inactive Account Connect With Customer Support.", STATUS_CODES.BAD_REQUEST);
        }
        // Rotate token
        await del(redisKey);
        const newTokenId = uuidv4();

        const newRefreshToken = generateRefreshToken({
            auth_id: authUser._id,
            token_id: newTokenId,
            type: TOKEN_TYPES.REFRESH ,
        });
        await set(
            `refresh:${authUser._id}:${newTokenId}`,
            "valid",
            "EX",
            REFRESH_TOKEN_EXPIRY
        );
        const newAccessToken = generateAccessToken({
            auth_id: authUser._id,
            role: authUser.role,
            type: TOKEN_TYPES.ACCESS,
        });

        res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: ACCESS_TOKEN_EXPIRY * 1000,
        });
        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: REFRESH_TOKEN_EXPIRY * 1000,
        });
        sendResponse({ res, message: "Token refreshed" });
    } catch (err) {
        logger.error("Refresh Error:", err);
        sendError(res, "Session expired", STATUS_CODES.UNAUTHORIZED);
    }
};