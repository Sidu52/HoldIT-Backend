import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import redis, { set, get, del, delByPattern } from "../../services/redisService.js";
import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_COOLDOWN,
    TOKEN_TYPES,
    OTP_FAIL_WINDOW_SECONDS,
    VERIFICATION_STATUS,
    REDIS_TTL,
} from "../../utils/constants.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import {
    clearAuthCookies,
    timingSafeEqual,
    generateTokenPair,
    checkOTPRateLimit,
} from "../../helpers/user/authHelper.js";
import { deleteUserProfileCache } from "./cache.js";
import { setAuthCookies } from "../../utils/helper.js";
import logger from "../../utils/logger.js";
import NotificationService from "../../services/NotificationService.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { generateOTP } from "../../utils/otp.js";

// Helpers
async function issueOTP(phone) {
    const otp = generateOTP();

    await redis
        .multi()
        .del(`otp:${phone}`)
        .del(`otp_fail:${phone}`)
        .del(`otp_cooldown:${phone}`)
        .del(`otp_rate:${phone}`)
        .set(`otp:${phone}`, otp, "EX", REDIS_TTL.OTP)
        .exec();

    return otp;
}

async function getPendingUser(phone) {
    const raw = await get(`pending_user:${phone}`);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function sanitizePhone(phone) {
    return String(phone || "").replace(/[^0-9+]/g, "").trim();
}

function validatePhone(phone) {
    const sanitizedPhone = sanitizePhone(phone);
    if (!sanitizedPhone || sanitizedPhone.length < 10 || sanitizedPhone.length > 15) {
        return null;
    }
    return sanitizedPhone;
}

// LOGIN / REGISTER
export const authUser = asyncHandler(async (req, res) => {
    const rawPhone = String(req.body?.phone || "");
    const phone = validatePhone(rawPhone);

    if (!phone) {
        return sendError(res, "A valid phone number is required.", STATUS_CODES.BAD_REQUEST);
    }

    const existingUser = await User.findOne({ phone })
        .select("account_status")
        .lean();

    if (existingUser) {
        if (existingUser.account_status === ACCOUNT_STATUS.BLOCKED) {
            return sendError(
                res,
                "Your account has been suspended. Please contact support.",
                STATUS_CODES.FORBIDDEN
            );
        }
    } else {
        const pendingPayload = JSON.stringify({ phone, createdAt: Date.now() });
        await set(`pending_user:${phone}`, pendingPayload, "EX", REDIS_TTL.PENDING_USER);
    }

    const isRateLimited = await checkOTPRateLimit(phone);
    if (isRateLimited) {
        return sendError(
            res,
            "Too many OTP requests. Please try again later.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const otp = await issueOTP(phone);

    if (process.env.NODE_ENV === "development") {
        logger.info(`[DEV] OTP for ${phone}: ${otp}`);
    }

    await NotificationService.sendOTP(phone, otp);

    return sendResponse({ res, message: "OTP sent successfully" });
});

// RESEND OTP
export const sendOTP = asyncHandler(async (req, res) => {
    const rawPhone = String(req.body?.phone || "");
    const phone = validatePhone(rawPhone);

    if (!phone) {
        return sendError(res, "A valid phone number is required.", STATUS_CODES.BAD_REQUEST);
    }

    const dbUser = await User.findOne({ phone }).select("account_status").lean();
    const pendingUser = !dbUser ? await getPendingUser(phone) : null;

    if (!dbUser && !pendingUser) {
        return sendError(
            res,
            "User not found. Please start registration again.",
            STATUS_CODES.NOT_FOUND
        );
    }

    if (dbUser) {
        const blocked =
            dbUser.account_status === ACCOUNT_STATUS.BLOCKED ||
            dbUser.account_status === ACCOUNT_STATUS.INACTIVE;
        if (blocked) {
            return sendError(
                res,
                "Your account has been suspended.",
                STATUS_CODES.FORBIDDEN
            );
        }
    }

    const isRateLimited = await checkOTPRateLimit(phone);
    if (isRateLimited) {
        return sendError(
            res,
            "Too many OTP requests. Please try again later.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Prevent rapid resends (cooldown gate)
    const cooldownExists = await get(`otp_cooldown:${phone}`);
    if (cooldownExists) {
        return sendError(
            res,
            "Please wait before requesting another OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const otp = await issueOTP(phone);

    // Re-apply cooldown AFTER issueOTP
    await set(`otp_cooldown:${phone}`, "1", "EX", OTP_COOLDOWN);

    if (process.env.NODE_ENV === "development") {
        logger.info(`[DEV] OTP for ${phone}: ${otp}`);
    }

    await NotificationService.sendOTP(phone, otp);

    return sendResponse({ res, message: "OTP sent successfully" });
});

// VERIFY OTP
export const verifyOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;

    const sanitizedPhone = validatePhone(phone);
    const sanitizedOtp = String(otp || "").replace(/[^0-9]/g, "");

    if (!sanitizedPhone) {
        return sendError(res, "A valid phone number is required.", STATUS_CODES.BAD_REQUEST);
    }
    if (sanitizedOtp.length !== OTP_LENGTH) {
        return sendError(res, `OTP must be ${OTP_LENGTH} digits.`, STATUS_CODES.BAD_REQUEST);
    }

    // Fail-attempt
    const failKey = `otp_fail:${sanitizedPhone}`;
    const failCount = await get(failKey);

    if (failCount && parseInt(failCount, 10) >= OTP_MAX_ATTEMPTS) {
        await del(`otp:${sanitizedPhone}`);
        return sendError(
            res,
            "Too many failed attempts. Please request a new OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Fetch stored OTP
    const savedOTP = await get(`otp:${sanitizedPhone}`);

    const isOtpValid =
        savedOTP &&
        savedOTP.length === sanitizedOtp.length &&
        timingSafeEqual(savedOTP, sanitizedOtp);

    if (!isOtpValid) {
        await redis
            .multi()
            .incr(failKey)
            .expire(failKey, OTP_FAIL_WINDOW_SECONDS)
            .exec();

        return sendError(res, "Invalid or expired OTP.", STATUS_CODES.UNAUTHORIZED);
    }

    // OTP is valid
    let user = await User.findOne({ phone: sanitizedPhone })
        .select("_id account_status verification_status")
        .lean();

    const isFirstLogin = !user;

    if (user) {
        if (
            user.account_status === ACCOUNT_STATUS.BLOCKED ||
            user.account_status === ACCOUNT_STATUS.INACTIVE
        ) {
            await cleanupOTPKeys(sanitizedPhone);
            return sendError(
                res,
                "Your account has been suspended.",
                STATUS_CODES.FORBIDDEN
            );
        }
    } else {
        const pendingUser = await getPendingUser(sanitizedPhone);
        if (!pendingUser) {
            return sendError(
                res,
                "Session expired. Please start registration again.",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        // Create DB record NOW (phone verified)
        user = await User.create({
            phone: sanitizedPhone,
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            last_login_at: new Date(),
            last_active_at: new Date(),
        });
    }

    // Clean up all OTP state
    await cleanupOTPKeys(sanitizedPhone);

    // Issue token pair
    const { accessToken, refreshToken } = await generateTokenPair(
        user._id,
        "user",
        "/api/v1/user/auth/refresh"
    );

    await setAuthCookies(res, accessToken, refreshToken, "/api/v1/user/auth/refresh");

    // Update returning user timestamps
    if (!isFirstLogin) {
        const now = new Date();
        const needsProfileCompletion =
            user.verification_status !== VERIFICATION_STATUS.PROFILE_COMPLETE;

        await User.findByIdAndUpdate(user._id, {
            $set: {
                last_login_at: now,
                last_active_at: now,
            },
        });

        return sendResponse({
            res,
            message: "Login successful",
            data: {
                accessToken,
                refreshToken,
                isFirstLogin: false,
                needsOnboarding: needsProfileCompletion,
            },
        });
    }

    return sendResponse({
        res,
        message: "Registration successful",
        data: {
            accessToken,
            refreshToken,
            isFirstLogin: true,
            needsOnboarding: true,
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
        clearAuthCookies(res, "/api/v1/user/auth/refresh");
        if (jwtErr.name === "TokenExpiredError") {
            return sendError(
                res,
                "Session expired. Please log in again.",
                STATUS_CODES.UNAUTHORIZED
            );
        }
        return sendError(res, "Invalid refresh token.", STATUS_CODES.UNAUTHORIZED);
    }

    if (decoded.type !== TOKEN_TYPES.REFRESH) {
        return sendError(res, "Invalid token type.", STATUS_CODES.UNAUTHORIZED);
    }

    const redisKey = `refresh:${decoded.auth_id}:${decoded.token_id}`;
    const storedToken = await get(redisKey);

    if (!storedToken) {
        await delByPattern(`refresh:${decoded.auth_id}:*`);
        clearAuthCookies(res, "/api/v1/user/auth/refresh");
        return sendError(
            res,
            "Session invalid. All sessions have been revoked for security.",
            STATUS_CODES.FORBIDDEN
        );
    }

    const user = await User.findById(decoded.auth_id)
        .select("account_status")
        .lean();

    if (!user) {
        await del(redisKey);
        clearAuthCookies(res, "/api/v1/user/auth/refresh");
        return sendError(res, "Account not found.", STATUS_CODES.UNAUTHORIZED);
    }

    if (
        user.account_status === ACCOUNT_STATUS.INACTIVE ||
        user.account_status === ACCOUNT_STATUS.BLOCKED
    ) {
        await del(redisKey);
        clearAuthCookies(res, "/api/v1/user/auth/refresh");
        return sendError(res, "Your account has been suspended.", STATUS_CODES.FORBIDDEN);
    }
    await del(redisKey);

    const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(
        decoded.auth_id,
        "user",
        "/api/v1/user/auth/refresh"
    );

    await setAuthCookies(res, accessToken, newRefreshToken, "/api/v1/user/auth/refresh");

    await User.findByIdAndUpdate(decoded.auth_id, {
        $set: { last_active_at: new Date() },
    }).catch((err) => logger.error("Failed to update last_active_at:", err));

    return sendResponse({
        res,
        message: "Token refreshed successfully",
        data: { accessToken, refreshToken: newRefreshToken },
    });
});

// COMPLETE PROFILE
export const updateUserDetails = asyncHandler(async (req, res) => {
    const { auth_id } = req.user;
    const { first_name, last_name, email, gender, date_of_birth, address, lat, lng } = req.body;
    const user = await User.findById(auth_id).select("account_status").lean();

    if (!user) {
        return sendError(res, "User not found.", STATUS_CODES.NOT_FOUND);
    }

    if (
        user.account_status === ACCOUNT_STATUS.BLOCKED ||
        user.account_status === ACCOUNT_STATUS.INACTIVE
    ) {
        return sendError(res, "Your account has been suspended.", STATUS_CODES.FORBIDDEN);
    }

    // Email uniqueness check
    const emailTaken = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: auth_id },
    })
        .select("_id")
        .lean();

    if (emailTaken) {
        return sendError(
            res,
            "Email is already associated with another account.",
            STATUS_CODES.CONFLICT
        );
    }

    const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);

    // Build the address subdocument
    const addressDoc = {
        street: address.trim(),
        city: "",
        state: "",
        postal_code: "",
        country: "",
        coordinates: [lng, lat],
        is_serviceable: isServiceable,
        is_default: true,
    };

    const updatedUser = await User.findByIdAndUpdate(
        auth_id,
        {
            $set: {
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                email: email.trim().toLowerCase(),
                gender: gender.toLowerCase(),
                date_of_birth: new Date(date_of_birth),
                location: {
                    type: "Point",
                    coordinates: [lng, lat],
                    address: address.trim(),
                },
                is_serviceable: isServiceable,
                service_area_id: serviceAreaId || null,
                verification_status: VERIFICATION_STATUS.PROFILE_COMPLETE,
                last_active_at: new Date(),
            },
            // Push default address only if none exists
            $push: {
                addresses: {
                    $each: [addressDoc],
                    $slice: 10,
                },
            },
        },
        { new: true, runValidators: true }
    )
        .select("-__v")
        .lean();

    if (!updatedUser) {
        return sendError(res, "Failed to update profile.", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }

    // Bust profile cache
    await deleteUserProfileCache(auth_id);

    return sendResponse({
        res,
        message: "Profile completed successfully",
        data: {
            user: updatedUser,
            isServiceable,
            ...(!isServiceable && {
                serviceMessage:
                    "Your location is not in our service area yet. We'll notify you when we expand.",
            }),
        },
    });
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
    const { token } = extractRefreshToken(req);

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
            if (decoded?.auth_id && decoded?.token_id) {
                await del(`refresh:${decoded.auth_id}:${decoded.token_id}`);
            }
        } catch { }
    }

    clearAuthCookies(res, "/api/v1/user/auth/refresh");
    return sendResponse({ res, message: "Logged out successfully" });
});

// Private helpers
async function cleanupOTPKeys(phone) {
    await Promise.all([
        del(`otp:${phone}`),
        del(`otp_fail:${phone}`),
        del(`otp_cooldown:${phone}`),
        del(`otp_rate:${phone}`),
        del(`pending_user:${phone}`),
    ]);
}