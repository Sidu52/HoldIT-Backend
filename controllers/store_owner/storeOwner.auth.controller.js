import jwt from "jsonwebtoken";
import StoreOwner from "../../models/StoreOwner.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { verifyStoreOwner } from "../../helpers/store_owner/storeOwner.helper.js";
import logger from "../../utils/logger.js";
import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    TOKEN_TYPES,
    VERIFICATION_STATUS,
    OTP_FAIL_WINDOW_SECONDS,
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
import {
    getCache,
    setCache,
    deleteCache,
    deleteByPattern,
    incrementCache,
} from "../../constants/redis/redisOperation.js";
import { AuthKeys, AuthTTL } from "../../constants/redis/auth.keys.js";
import { StoreOwnerKeys, StoreOwnerTTL } from "../../constants/redis/storeOwner.keys.js";
import { invalidateStoreOwnerCache } from "../../constants/redis/invalidate/storeOwner.invalidate.js";

// Shared OTP dispatch helper
async function dispatchOTP(res, phone) {
    const normalizedPhone = String(phone).replace(/[^0-9+]/g, "");
    const isRateLimited = await checkOTPRateLimit("store_owner", normalizedPhone);
    if (isRateLimited) {
        return {
            limited: true,
            response: sendError(
                res,
                "Too many OTP requests. Please try again later.",
                STATUS_CODES.TOO_MANY_REQUESTS
            ),
        };
    }

    const cooldownKey = AuthKeys.otpCooldown("store_owner", normalizedPhone);
    const cooldownExists = await getCache(cooldownKey);
    if (cooldownExists) {
        return {
            limited: true,
            response: sendError(
                res,
                "Please wait before requesting another OTP.",
                STATUS_CODES.TOO_MANY_REQUESTS
            ),
        };
    }

    const otp = await generateAndStoreOTP("store_owner", normalizedPhone);
    await setCache(cooldownKey, "1", AuthTTL.OTP_COOLDOWN);
    await NotificationService.sendOTP(normalizedPhone, otp);

    return { limited: false, otp };
}

// REGISTER
export const registerStoreOwner = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const existingOwner = await StoreOwner.findOne({ phone })
        .select("verification_status")
        .lean();

    if (existingOwner?.verification_status === VERIFICATION_STATUS.VERIFIED) {
        return sendError(
            res,
            "User already exists. Please login instead.",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const pendingKey = AuthKeys.pendingOwner(phone);
    await setCache(pendingKey, phone, AuthTTL.PENDING_USER);

    const { limited, response, otp } = await dispatchOTP(res, phone);
    if (limited) return response;

    return sendResponse({ res, data: { otp }, message: "Registration OTP sent successfully" });
});

// LOGIN
export const loginStoreOwner = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    const owner = await StoreOwner.findOne({ phone })
        .select("account_status verification_status")
        .lean();

    if (!owner) {
        return sendError(
            res,
            "User not found. Please register first.",
            STATUS_CODES.NOT_FOUND
        );
    }

    const ownerCheck = verifyStoreOwner(owner);
    if (!ownerCheck.valid) {
        return sendError(res, ownerCheck.message, ownerCheck.code);
    }

    const { limited, response, otp } = await dispatchOTP(res, phone);
    if (limited) return response;

    return sendResponse({ res, data: { otp }, message: "Login OTP sent successfully" });
});

// RESEND OTP
export const sendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    const pendingKey = AuthKeys.pendingOwner(phone);
    const isPending = await getCache(pendingKey);

    if (!isPending) {
        const owner = await StoreOwner.findOne({ phone })
            .select("account_status verification_status")
            .lean();

        if (!owner) {
            return sendError(
                res,
                "User not found. Please register first.",
                STATUS_CODES.NOT_FOUND
            );
        }

        const ownerCheck = verifyStoreOwner(owner);
        if (!ownerCheck.valid) {
            return sendError(res, ownerCheck.message, ownerCheck.code);
        }
    }

    const { limited, response, otp } = await dispatchOTP(res, phone);
    if (limited) return response;

    return sendResponse({ res, data: { otp }, message: "OTP sent successfully" });
});

// VERIFY OTP
export const verifyOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;

    const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
    const sanitizedOtp = otp.replace(/[^0-9]/g, "");

    if (sanitizedOtp.length !== OTP_LENGTH) {
        return sendError(res, `OTP must be ${OTP_LENGTH} digits`, STATUS_CODES.BAD_REQUEST);
    }

    const failKey = AuthKeys.otpFail("store_owner", sanitizedPhone);
    const failCount = await getCache(failKey);
    if (failCount && parseInt(failCount, 10) >= OTP_MAX_ATTEMPTS) {
        await deleteCache(AuthKeys.otp("store_owner", sanitizedPhone));
        return sendError(
            res,
            "Too many failed attempts. Please request a new OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Validate OTP
    const savedOTP = await getCache(AuthKeys.otp("store_owner", sanitizedPhone));
    const isOtpValid =
        savedOTP &&
        savedOTP.length === sanitizedOtp.length &&
        timingSafeEqual(savedOTP, sanitizedOtp);

    if (!isOtpValid) {
        await incrementCache(failKey, OTP_FAIL_WINDOW_SECONDS);
        return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
    }

    let owner = await StoreOwner.findOne({ phone: sanitizedPhone })
        .select("_id account_status verification_status")
        .lean();

    if (!owner) {
        const pendingKey = AuthKeys.pendingOwner(sanitizedPhone);
        const pendingRaw = await getCache(pendingKey);

        if (!pendingRaw) {
            return sendError(
                res,
                "Registration session expired. Please register again.",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        owner = await StoreOwner.create({
            phone: sanitizedPhone,
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            last_login_at: new Date(),
        });

        await deleteCache(pendingKey);
    } else {
        const ownerCheck = verifyStoreOwner(owner);
        if (!ownerCheck.valid) {
            return sendError(res, ownerCheck.message, ownerCheck.code);
        }
    }

    await Promise.all([
        deleteCache(AuthKeys.otp("store_owner", sanitizedPhone)),
        deleteCache(failKey),
        deleteCache(AuthKeys.otpCooldown("store_owner", sanitizedPhone)),
        deleteCache(AuthKeys.otpRate("store_owner", sanitizedPhone)),
    ]);

    const { accessToken, refreshToken } = await generateTokenPair(
        owner._id,
        "store_owner",
        "/api/v1/store-owner/auth/refresh"
    );

    StoreOwner.findByIdAndUpdate(owner._id, {
        $set: {
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            last_login_at: new Date(),
        },
    }).catch((err) => logger.error("Failed to update owner login timestamps:", err));

    await setCache(
        StoreOwnerKeys.profile(owner._id),
        {
            _id: owner._id,
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
        },
        StoreOwnerTTL.PROFILE
    );

    await setAuthCookies(res, accessToken, refreshToken, "/api/v1/store-owner/auth/refresh");

    return sendResponse({ res, message: "Login successful", data: {} });
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
        clearAuthCookies(res, "/api/v1/store-owner/auth/refresh");
        if (jwtErr.name === "TokenExpiredError") {
            return sendError(res, "Session expired. Please log in again.", STATUS_CODES.UNAUTHORIZED);
        }
        return sendError(res, "Invalid refresh token.", STATUS_CODES.UNAUTHORIZED);
    }

    if (decoded.type !== TOKEN_TYPES.REFRESH) {
        return sendError(res, "Invalid token type.", STATUS_CODES.UNAUTHORIZED);
    }
    const redisKey = AuthKeys.refreshToken("store_owner", decoded.auth_id, decoded.token_id);
    const exists = await getCache(redisKey);

    if (!exists) {
        await deleteByPattern(AuthKeys.refreshTokenPattern("store_owner", decoded.auth_id));
        clearAuthCookies(res, "/api/v1/store-owner/auth/refresh");
        return sendError(
            res,
            "Session invalid. All sessions have been revoked for security.",
            STATUS_CODES.FORBIDDEN
        );
    }

    const cacheKey = StoreOwnerKeys.profile(decoded.auth_id);
    let owner = await getCache(cacheKey);

    if (!owner) {
        owner = await StoreOwner.findById(decoded.auth_id)
            .select("account_status verification_status")
            .lean();

        if (!owner) {
            await deleteCache(redisKey);
            clearAuthCookies(res, "/api/v1/store-owner/auth/refresh");
            return sendError(res, "Store owner account not found.", STATUS_CODES.UNAUTHORIZED);
        }
        await setCache(cacheKey, owner, StoreOwnerTTL.PROFILE);
    }

    if (
        owner.account_status === ACCOUNT_STATUS.BLOCKED ||
        owner.verification_status !== VERIFICATION_STATUS.VERIFIED
    ) {
        await deleteCache(redisKey);
        await invalidateStoreOwnerCache(decoded.auth_id);
        clearAuthCookies(res, "/api/v1/store-owner/auth/refresh");
        return sendError(res, "This account has been suspended.", STATUS_CODES.FORBIDDEN);
    }

    await deleteCache(redisKey);

    const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(
        decoded.auth_id,
        "store_owner",
        "/api/v1/store-owner/auth/refresh"
    );
    StoreOwner.findByIdAndUpdate(decoded.auth_id, { last_login_at: new Date() }).catch((err) =>
        logger.error("Failed to update owner last_login_at:", err)
    );

    await setAuthCookies(res, accessToken, newRefreshToken, "/api/v1/store-owner/auth/refresh");
    return sendResponse({ res, message: "Token refreshed successfully" });
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
    const { token } = extractRefreshToken(req);

    if (token) {
        const decoded = jwt.decode(token);
        if (decoded?.auth_id && decoded?.token_id) {
            await Promise.all([
                deleteCache(AuthKeys.refreshToken("store_owner", decoded.auth_id, decoded.token_id)),
                deleteCache(AuthKeys.accessToken("store_owner", decoded.auth_id, decoded.token_id)),
                invalidateStoreOwnerCache(decoded.auth_id),
            ]);
        }
    }

    clearAuthCookies(res, "/api/v1/store-owner/auth/refresh");
    return sendResponse({ res, message: "Logged out successfully" });
});