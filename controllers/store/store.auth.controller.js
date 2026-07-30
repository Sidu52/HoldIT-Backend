import jwt from "jsonwebtoken";
import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { getCache, setCache, deleteCache, deleteByPattern, incrementCache, isKeyExist } from "../../constants/redis/redisOperation.js";
import { AuthKeys, AuthTTL } from "../../constants/redis/auth.keys.js";
import { verifyStore } from "../../helpers/store/store.helper.js";
import logger from "../../utils/logger.js";
import { addJobToQueue, cancelJob } from "../../services/jobService.js";
import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    JOB_QUEUES,
    TOKEN_TYPES,
    UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS,
    VERIFICATION_STATUS,
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

// LOGIN
export const loginStore = asyncHandler(async (req, res) => {
    const { phone } = req.body || {};
    const store = await Store.findOne({ phone })
        .select("account_status verification_status store_owner_id")
        .populate({ path: "store_owner_id", select: "account_status" })
        .lean();

    if (!store) {
        return sendError(
            res,
            "Store not found. Please register.",
            STATUS_CODES.NOT_FOUND
        );
    }
    const owner = store.store_owner_id;

    // Validate store and owner state
    const storeCheck = verifyStore(store, owner);
    if (!storeCheck.valid) {
        return sendError(res, storeCheck.message, storeCheck.code);
    }

    // OTP rate limit
    const isRateLimited = await checkOTPRateLimit("store", phone);
    if (isRateLimited) {
        return sendError(
            res,
            "Too many OTP requests. Please try again later.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Cooldown
    const cooldownExists = await isKeyExist(AuthKeys.otpCooldown("store", phone));
    if (cooldownExists) {
        return sendError(
            res,
            "Please wait before requesting another OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Generate OTP
    const otp = await generateAndStoreOTP("store", phone);
    await setCache(AuthKeys.otpCooldown("store", phone), "1", AuthTTL.OTP_COOLDOWN);

    // Send SMS/Email via abstract service
    await NotificationService.sendOTP(phone, otp);

    return sendResponse({
        res,
        message: "Login OTP sent successfully",
    });
});

// RESEND OTP
export const sendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body || {};

    const store = await Store.findOne({ phone })
        .select("account_status verification_status store_owner_id")
        .populate({ path: "store_owner_id", select: "account_status" })
        .lean();

    const owner = store?.store_owner_id;
    const storeCheck = verifyStore(store, owner);
    if (!storeCheck.valid) {
        return sendError(res, storeCheck.message, storeCheck.code);
    }

    const isRateLimited = await checkOTPRateLimit("store", phone);
    if (isRateLimited) {
        return sendError(res, "Too many OTP requests. Please try again later.", STATUS_CODES.TOO_MANY_REQUESTS);
    }

    const cooldownExists = await isKeyExist(AuthKeys.otpCooldown("store", phone));
    if (cooldownExists) {
        return sendError(res, "Please wait before requesting another OTP.", STATUS_CODES.TOO_MANY_REQUESTS);
    }

    const otp = await generateAndStoreOTP("store", phone);
    await setCache(AuthKeys.otpCooldown("store", phone), "1", AuthTTL.OTP_COOLDOWN);

    await NotificationService.sendOTP(phone, otp);

    return sendResponse({ res, message: "OTP sent successfully" });
});

// VERIFY OTP
export const verifyOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body || {};

    if (!phone || typeof phone !== "string") {
        return sendError(res, "Phone number is required", STATUS_CODES.BAD_REQUEST);
    }
    if (!otp || typeof otp !== "string") {
        return sendError(res, "OTP is required", STATUS_CODES.BAD_REQUEST);
    }

    const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
    if (sanitizedPhone.length < 10 || sanitizedPhone.length > 15) {
        return sendError(res, "Invalid phone number format", STATUS_CODES.BAD_REQUEST);
    }

    const sanitizedOtp = otp.replace(/[^0-9]/g, "");
    if (sanitizedOtp.length !== OTP_LENGTH) {
        return sendError(res, `OTP must be ${OTP_LENGTH} digits`, STATUS_CODES.BAD_REQUEST);
    }

    const failKey = AuthKeys.otpFail("store", sanitizedPhone);
    const failCount = await getCache(failKey);
    if (failCount && parseInt(failCount, 10) >= OTP_MAX_ATTEMPTS) {
        await deleteCache(AuthKeys.otp("store", sanitizedPhone));
        return sendError(
            res,
            "Too many failed attempts. Please request a new OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const store = await Store.findOne({ phone: sanitizedPhone })
        .select("_id account_status verification_status store_owner_id")
        .populate({ path: "store_owner_id", select: "account_status" })
        .lean();

    if (!store) {
        return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
    }

    const owner = store.store_owner_id;
    const storeCheck = verifyStore(store, owner);
    if (!storeCheck.valid) {
        return sendError(res, storeCheck.message, storeCheck.code);
    }

    let savedOTP = await getCache(AuthKeys.otp("store", sanitizedPhone));
    if (savedOTP) {
        try {
            savedOTP = JSON.parse(savedOTP);
        } catch (_) {
            // Keep as string
        }
    }

    const isOtpValid =
        savedOTP &&
        String(savedOTP).length === sanitizedOtp.length &&
        timingSafeEqual(String(savedOTP), sanitizedOtp);

    if (!isOtpValid) {
        await incrementCache(failKey, AuthTTL.OTP_FAIL_WINDOW);
        return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
    }

    await Promise.all([
        deleteCache(AuthKeys.otp("store", sanitizedPhone)),
        deleteCache(failKey),
        deleteCache(AuthKeys.otpCooldown("store", sanitizedPhone)),
        deleteCache(AuthKeys.otpRate("store", sanitizedPhone)),
        cancelJob(JOB_QUEUES.DELETE_UNVERIFIED_STORE, `delete-store-${sanitizedPhone}`),
    ]);

    const { accessToken, refreshToken } = await generateTokenPair(store._id, "store", "/api/v1/store/auth/refresh");

    const now = new Date();
    const isFirstLogin = !store.verification_status;

    await Store.findByIdAndUpdate(store._id, {
        $set: {
            verification_status: VERIFICATION_STATUS.VERIFIED,
            last_login_at: now,
            last_active_at: now,
        },
    });

    setAuthCookies(res, accessToken, refreshToken, "/api/v1/store/auth/refresh");

    return sendResponse({
        res,
        message: "Login successful",
        data: {
            isFirstLogin,
            needsOnboarding: isFirstLogin,
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
        clearAuthCookies(res, "/api/v1/store/auth/refresh");
        if (jwtErr.name === "TokenExpiredError") {
            return sendError(res, "Session expired. Please log in again.", STATUS_CODES.UNAUTHORIZED);
        }
        return sendError(res, "Invalid refresh token", STATUS_CODES.UNAUTHORIZED);
    }

    if (decoded.type !== TOKEN_TYPES.REFRESH) {
        return sendError(res, "Invalid token type", STATUS_CODES.UNAUTHORIZED);
    }

    const redisKey = AuthKeys.refreshToken("store", decoded.auth_id, decoded.token_id);
    const exists = await getCache(redisKey);

    if (!exists) {
        await deleteByPattern(AuthKeys.refreshTokenPattern("store", decoded.auth_id));
        clearAuthCookies(res, "/api/v1/store/auth/refresh");
        return sendError(
            res,
            "Session invalid. All sessions have been revoked for security.",
            STATUS_CODES.FORBIDDEN
        );
    }

    const store = await Store.findById(decoded.auth_id)
        .select("account_status verification_status store_owner_id")
        .populate({ path: "store_owner_id", select: "account_status" })
        .lean();

    if (!store) {
        await deleteCache(redisKey);
        clearAuthCookies(res, "/api/v1/store/auth/refresh");
        return sendError(res, "Store account not found", STATUS_CODES.UNAUTHORIZED);
    }

    const owner = store.store_owner_id;
    const storeCheck = verifyStore(store, owner);
    if (!storeCheck.valid) {
        await Promise.allSettled([
            deleteCache(redisKey),
            deleteByPattern(AuthKeys.refreshTokenPattern("store", decoded.auth_id)),
            deleteByPattern(AuthKeys.accessTokenPattern("store", decoded.auth_id)),
        ]);
        clearAuthCookies(res, "/api/v1/store/auth/refresh");
        return sendError(res, storeCheck.message, storeCheck.code);
    }

    await deleteCache(redisKey);

    const { accessToken, refreshToken: newRefreshToken } =
        await generateTokenPair(decoded.auth_id, "store", "/api/v1/store/auth/refresh");

    Store.findByIdAndUpdate(decoded.auth_id, {
        last_active_at: new Date(),
    }).catch((err) => logger.error("Failed to update store last_active_at:", err));

    // Set cookies
    setAuthCookies(res, accessToken, newRefreshToken, "/api/v1/store/auth/refresh");

    return sendResponse({
        res,
        message: "Token refreshed successfully",
    });
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
    const { token } = extractRefreshToken(req);

    if (token) {
        const decoded = jwt.decode(token);
        if (decoded?.auth_id && decoded?.token_id) {
            await deleteCache(AuthKeys.refreshToken("store", decoded.auth_id, decoded.token_id));
            await deleteCache(AuthKeys.accessToken("store", decoded.auth_id, decoded.token_id));
        }
    }
    clearAuthCookies(res, "/api/v1/store/auth/refresh");
    return sendResponse({ res, message: "Logged out successfully" });
});