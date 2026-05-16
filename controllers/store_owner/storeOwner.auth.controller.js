import jwt from "jsonwebtoken";
import StoreOwner from "../../models/StoreOwner.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import redis from "../../services/redisService.js";

import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_COOLDOWN,
    TOKEN_TYPES,
    OTP_FAIL_WINDOW_SECONDS,
    ON_BOARDING_STATUS,
} from "../../utils/constants.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import {
    clearAuthCookies,
    timingSafeEqual,
    generateTokenPair,
    checkOTPRateLimit,
    generateAndStoreOTP,
} from "../../helpers/user/authHelper.js";
import { setAuthCookies } from "../../utils/helper.js";
import NotificationService from "../../services/NotificationService.js";
import asyncHandler from "../../utils/asyncHandler.js";

// REGISTER
export const registerStoreOwner = asyncHandler(async (req, res) => {
        const { phone } = req.body;

        const existingOwner = await StoreOwner.findOne({ phone }).lean();

        if (existingOwner) {
            return sendError(
                res,
                "User already exists. Please login instead.",
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Create new user
        await StoreOwner.create({
            phone,
            status: ACCOUNT_STATUS.PENDING,
            is_active: true,
            is_verified: false,
        });

        // Rate limit check
        const isRateLimited = await checkOTPRateLimit(phone);
        if (isRateLimited) {
            return sendError(
                res,
                "Too many OTP requests. Please try again later.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        // Cooldown check
        const cooldownKey = `otp_cooldown:${phone}`;
        const cooldownExists = await get(cooldownKey);

        if (cooldownExists) {
            return sendError(
                res,
                "Please wait before requesting another OTP.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        // Generate OTP
        const otp = await generateAndStoreOTP(phone);
        await set(cooldownKey, "1", "EX", OTP_COOLDOWN);

        // Send SMS/Email via abstract service
        await NotificationService.sendOTP(phone, otp);

        return sendResponse({
            res,
            message: "Registration OTP sent successfully",
            data: { otp },
        });
});

// LOGIN
export const loginStoreOwner = asyncHandler(async (req, res) => {
        const { phone } = req.body;

        const owner = await StoreOwner.findOne({ phone })
            .select("status is_verified is_active")
            .lean();

        if (!owner) {
            return sendError(
                res,
                "User not found. Please register first.",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Validate user status
        const ownerCheck = verifyStoreOwner(owner);
        if (!ownerCheck.valid) {
            return sendError(res, ownerCheck.message, ownerCheck.code);
        }

        // Rate limit
        const isRateLimited = await checkOTPRateLimit(phone);
        if (isRateLimited) {
            return sendError(
                res,
                "Too many OTP requests. Please try again later.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        // Cooldown
        const cooldownKey = `otp_cooldown:${phone}`;
        const cooldownExists = await get(cooldownKey);

        if (cooldownExists) {
            return sendError(
                res,
                "Please wait before requesting another OTP.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        // Generate OTP
        const otp = await generateAndStoreOTP(phone);
        await set(cooldownKey, "1", "EX", OTP_COOLDOWN);

        // Send SMS/Email via abstract service
        await NotificationService.sendOTP(phone, otp);

        return sendResponse({
            res,
            message: "Login OTP sent successfully",
            data: { otp },
        });
});

// RESEND OTP
export const sendOTP = asyncHandler(async (req, res) => {
        const { phone } = req.body;

        const owner = await StoreOwner.findOne({ phone })
            .select("status is_verified is_active")
            .lean();

        const ownerCheck = verifyStoreOwner(owner);
        if (!ownerCheck.valid) {
            return sendError(res, ownerCheck.message, ownerCheck.code);
        }

        const isRateLimited = await checkOTPRateLimit(phone);
        if (isRateLimited) {
            return sendError(res, "Too many OTP requests. Please try again later.", STATUS_CODES.TOO_MANY_REQUESTS);
        }

        const cooldownKey = `otp_cooldown:${phone}`;
        const cooldownExists = await get(cooldownKey);
        if (cooldownExists) {
            return sendError(res, "Please wait before requesting another OTP.", STATUS_CODES.TOO_MANY_REQUESTS);
        }

        const otp = await generateAndStoreOTP(phone);
        await set(cooldownKey, "1", "EX", OTP_COOLDOWN);

        // Send SMS/Email via abstract service
        await NotificationService.sendOTP(phone, otp);

        return sendResponse({ res, message: "OTP sent successfully", data: { otp } });
});

// VERIFY OTP
export const verifyOTP = asyncHandler(async (req, res) => {
        const { phone, otp } = req.body;

        const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
        const sanitizedOtp = otp.replace(/[^0-9]/g, "");

        if (sanitizedOtp.length !== OTP_LENGTH) {
            return sendError(res, `OTP must be ${OTP_LENGTH} digits`, STATUS_CODES.BAD_REQUEST);
        }

        const failKey = `otp_fail:${sanitizedPhone}`;
        const failCount = await get(failKey);
        if (failCount && parseInt(failCount, 10) >= OTP_MAX_ATTEMPTS) {
            await del(`otp:${sanitizedPhone}`);
            return sendError(res, "Too many failed attempts. Please request a new OTP.", STATUS_CODES.TOO_MANY_REQUESTS);
        }

        const owner = await StoreOwner.findOne({ phone: sanitizedPhone })
            .select("_id status is_verified is_active onboarding_status")
            .lean();

        if (!owner) {
            return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
        }

        const ownerCheck = verifyStoreOwner(owner);
        if (!ownerCheck.valid) {
            return sendError(res, ownerCheck.message, ownerCheck.code);
        }

        const savedOTP = await get(`otp:${sanitizedPhone}`);
        const isOtpValid =
            savedOTP &&
            savedOTP.length === sanitizedOtp.length &&
            timingSafeEqual(savedOTP, sanitizedOtp);

        if (!isOtpValid) {
            await redis.multi().incr(failKey).expire(failKey, OTP_FAIL_WINDOW_SECONDS).exec();
            return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
        }

        await Promise.all([
            del(`otp:${sanitizedPhone}`),
            del(failKey),
            del(`otp_cooldown:${sanitizedPhone}`),
            del(`otp_rate:${sanitizedPhone}`),
        ]);

        const { accessToken, refreshToken } = await generateTokenPair(owner._id, "store_owner");

        const now = new Date();
        const isFirstLogin = !owner.is_verified;

        await StoreOwner.findByIdAndUpdate(owner._id, {
            $set: {
                is_verified: true,
                last_login_at: now,
                last_active_at: now,
            },
        });

        console.log("Login successful");
        const response = await setAuthCookies(res, accessToken, refreshToken);
        console.log("response", response);
        return sendResponse({
            res,
            message: "Login successful",
            data: {
                accessToken,
                refreshToken,
                isFirstLogin,
                // Tells the frontend which screen to show next
                needsOnboarding: owner.onboarding_status !== ON_BOARDING_STATUS.COMPLETED,
            },
        });
});

// REFRESH TOKEN
export const refreshToken = asyncHandler(async (req, res) => {
        const { token } = extractRefreshToken(req);
        if (!token) {
            return sendError(res, "Refresh token required.", STATUS_CODES.UNAUTHORIZED);
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        } catch (jwtErr) {
            clearAuthCookies(res);
            if (jwtErr.name === "TokenExpiredError") {
                return sendError(res, "Session expired. Please log in again.", STATUS_CODES.UNAUTHORIZED);
            }
            return sendError(res, "Invalid refresh token.", STATUS_CODES.UNAUTHORIZED);
        }

        if (decoded.type !== TOKEN_TYPES.REFRESH) {
            return sendError(res, "Invalid token type.", STATUS_CODES.UNAUTHORIZED);
        }

        const redisKey = `refresh:${decoded.auth_id}:${decoded.token_id}`;
        const exists = await get(redisKey);

        if (!exists) {
            await delByPattern(`refresh:${decoded.auth_id}:*`);
            clearAuthCookies(res);
            return sendError(res, "Session invalid. All sessions have been revoked for security.", STATUS_CODES.FORBIDDEN);
        }

        const owner = await StoreOwner.findById(decoded.auth_id)
            .select("status is_active")
            .lean();

        if (!owner) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(res, "Store owner account not found.", STATUS_CODES.UNAUTHORIZED);
        }

        if (owner.status === ACCOUNT_STATUS.BLOCKED || !owner.is_active) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(res, "This account has been suspended.", STATUS_CODES.FORBIDDEN);
        }

        await del(redisKey);

        const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(decoded.auth_id, "store_owner");

        StoreOwner.findByIdAndUpdate(decoded.auth_id, {
            last_active_at: new Date(),
        }).catch((err) => logger.error("Failed to update owner last_active_at:", err));
setAuthCookies(res, accessToken, refreshToken);
        return sendResponse({
            res,
            message: "Token refreshed successfully",
            data: { accessToken, refreshToken: newRefreshToken },
        });
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
        const token = req.cookies?.refreshToken;

        if (token) {
            const decoded = jwt.decode(token);
            if (decoded?.auth_id && decoded?.token_id) {
                await del(`refresh:${decoded.auth_id}:${decoded.token_id}`);
                await del(`access:${decoded.auth_id}:${decoded.token_id}`);
            }
        }

        clearAuthCookies(res);
        return sendResponse({ res, message: "Logged out successfully" });
});