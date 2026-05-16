import jwt from "jsonwebtoken";
import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import redis from "../../services/redisService.js";
import { addJobToQueue, cancelJob } from "../../services/jobService.js";
import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_COOLDOWN,
    JOB_QUEUES,
    TOKEN_TYPES,
    OTP_FAIL_WINDOW_SECONDS,
    UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS,
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
// export const registerStore = async (req, res) => {
//     try {
//         const { phone } = req.body || {};

//         const existingStore = await Store.findOne({ phone }).lean();

//         if (existingStore) {
//             return sendError(
//                 res,
//                 "Store already exists. Please login.",
//                 STATUS_CODES.BAD_REQUEST
//             );
//         }

//         // Create new store
//         await Store.create({
//             phone,
//             store_name: "Pending Setup",
//             location: { type: "Point", coordinates: [0, 0] },
//             is_verified: false,
//             is_active: true,
//             status: ACCOUNT_STATUS.PENDING,
//         });

//         // OTP rate limit
//         const isRateLimited = await checkOTPRateLimit(phone);
//         if (isRateLimited) {
//             return sendError(
//                 res,
//                 "Too many OTP requests. Please try again later.",
//                 STATUS_CODES.TOO_MANY_REQUESTS
//             );
//         }

//         // Cooldown
//         const cooldownKey = `otp_cooldown:${phone}`;
//         const cooldownExists = await get(cooldownKey);

//         if (cooldownExists) {
//             return sendError(
//                 res,
//                 "Please wait before requesting another OTP.",
//                 STATUS_CODES.TOO_MANY_REQUESTS
//             );
//         }

//         // Generate OTP
//         const otp = await generateAndStoreOTP(phone);
//         await set(cooldownKey, "1", "EX", OTP_COOLDOWN);

//         // Schedule cleanup job (only for new users)
//         await cancelJob(JOB_QUEUES.DELETE_UNVERIFIED_STORE, `delete-store-${phone}`);

//         await addJobToQueue(
//             JOB_QUEUES.DELETE_UNVERIFIED_STORE,
//             {
//                 name: JOB_QUEUES.DELETE_UNVERIFIED_STORE,
//                 data: { phone, entity: "store" },
//             },
//             {
//                 delay: UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS,
//                 jobId: `delete-store-${phone}`,
//                 removeOnComplete: true,
//                 removeOnFail: true,
//             }
//         );

//         if (process.env.NODE_ENV === "development") {
//             logger.info(`[DEV] Register Store OTP for ${phone}: ${otp}`);
//         }

//         return sendResponse({
//             res,
//             message: "Registration OTP sent successfully",
//             data: { otp },
//         });

//     } catch (err) {
//         logger.error("Register Store Error:", err);
//         return sendError(res, "Something went wrong.");
//     }
// };

// LOGIN
export const loginStore = asyncHandler(async (req, res) => {
        const { phone } = req.body || {};

        const store = await Store.findOne({ phone })
            .select("status is_verified is_active")
            .lean();

        if (!store) {
            return sendError(
                res,
                "Store not found. Please register.",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Validate store state
        const storeCheck = verifyStore(store);
        if (!storeCheck.valid) {
            return sendError(res, storeCheck.message, storeCheck.code);
        }

        // OTP rate limit
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
        const { phone } = req.body || {};

        const store = await Store.findOne({ phone })
            .select("status is_verified is_active")
            .lean();

        const storeCheck = verifyStore(store);
        if (!storeCheck.valid) {
            return sendError(res, storeCheck.message, storeCheck.code);
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

        const store = await Store.findOne({ phone: sanitizedPhone })
            .select("_id status is_verified is_active")
            .lean();


        if (!store) {
            return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
        }

        const storeCheck = verifyStore(store);
        if (!storeCheck.valid) {
            return sendError(res, storeCheck.message, storeCheck.code);
        }

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

            return sendError(res, "Invalid or expired OTP", STATUS_CODES.UNAUTHORIZED);
        }

        await Promise.all([
            del(`otp:${sanitizedPhone}`),
            del(failKey),
            del(`otp_cooldown:${sanitizedPhone}`),
            del(`otp_rate:${sanitizedPhone}`),
            cancelJob(JOB_QUEUES.DELETE_UNVERIFIED_STORE, `delete-store-${sanitizedPhone}`),
        ]);

        const { accessToken, refreshToken } = await generateTokenPair(store._id, "store");

        const now = new Date();
        const isFirstLogin = !store.is_verified;

        await Store.findByIdAndUpdate(store._id, {
            $set: {
                is_verified: true,
                last_login_at: now,
                last_active_at: now,
            },
        });

        setAuthCookies(res, accessToken, refreshToken);

        return sendResponse({
            res,
            message: "Login successful",
            data: {
                accessToken,
                refreshToken,
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
            clearAuthCookies(res);
            if (jwtErr.name === "TokenExpiredError") {
                return sendError(res, "Session expired. Please log in again.", STATUS_CODES.UNAUTHORIZED);
            }
            return sendError(res, "Invalid refresh token", STATUS_CODES.UNAUTHORIZED);
        }

        if (decoded.type !== TOKEN_TYPES.REFRESH) {
            return sendError(res, "Invalid token type", STATUS_CODES.UNAUTHORIZED);
        }

        const redisKey = `refresh:${decoded.auth_id}:${decoded.token_id}`;
        const exists = await get(redisKey);

        if (!exists) {
            await delByPattern(`refresh:${decoded.auth_id}:*`);
            clearAuthCookies(res);
            return sendError(
                res,
                "Session invalid. All sessions have been revoked for security.",
                STATUS_CODES.FORBIDDEN
            );
        }

        const store = await Store.findById(decoded.auth_id)
            .select("status is_active")
            .lean();

        if (!store) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(res, "Store account not found", STATUS_CODES.UNAUTHORIZED);
        }

        if (store.status === ACCOUNT_STATUS.BLOCKED || !store.is_active) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(res, "This store account has been suspended.", STATUS_CODES.FORBIDDEN);
        }

        await del(redisKey);

        const { accessToken, refreshToken: newRefreshToken } =
            await generateTokenPair(decoded.auth_id, "store");

        Store.findByIdAndUpdate(decoded.auth_id, {
            last_active_at: new Date(),
        }).catch((err) => logger.error("Failed to update store last_active_at:", err));

        // Set cookies
        setAuthCookies(res, accessToken, refreshToken);

        return sendResponse({
            res,
            message: "Token refreshed successfully",
            data: {
                accessToken,
                refreshToken: newRefreshToken,
            },
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