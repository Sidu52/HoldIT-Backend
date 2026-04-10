import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import redis, {
    set,
    get,
    del,
    delByPattern,
} from "../../services/redisService.js";
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
    UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS
} from "../../utils/constants.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import { checkServiceability } from "../../utils/serviceable.js";
import { clearAuthCookies, timingSafeEqual, generateTokenPair, checkOTPRateLimit, generateAndStoreOTP } from "../../helpers/user/authHelper.js";
import logger from "../../utils/logger.js";
import sendEmail from "../../mailer/emailService.js";


// LOGIN / REGISTER
export const authUser = async (req, res) => {
    try {
        const { phone } = req.body;

        let user = await User.findOne({ phone })
            .select("status is_verified")
            .lean();

        if (user) {
            if (user.status === ACCOUNT_STATUS.BLOCKED) {
                return sendError(
                    res,
                    "Your account has been suspended. Please contact support.",
                    STATUS_CODES.FORBIDDEN
                );
            }
        } else {
            user = await User.create({
                phone,
                is_verified: false,
                is_active: true,
                status: ACCOUNT_STATUS.PENDING,
            });
        }

        const isRateLimited = await checkOTPRateLimit(phone);
        if (isRateLimited) {
            return sendError(
                res,
                "Too many OTP requests. Please try again later.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        const otp = await generateAndStoreOTP(phone);
        // manage otp with redies 
        // DELETE any existing OTP and related keys for this phone number
        await Promise.all([
            del(`otp:${phone}`),
            del(`otp_fail:${phone}`),
            del(`otp_cooldown:${phone}`),
            del(`otp_rate:${phone}`),
        ]);

        // Store new OTP with expiry using constant
        await set(`otp:${phone}`, otp, "EX", OTP_EXPIRY);

        if (process.env.NODE_ENV === "development") {
            logger.info(`[DEV] OTP for ${phone}: ${otp}`);
        }


        // Schedule cleanup of unverified users
        await cancelJob(JOB_QUEUES.DELETE_UNVERIFIED_USER, `delete-user-${phone}`);
        await addJobToQueue(
            JOB_QUEUES.DELETE_UNVERIFIED_USER,
            { name: JOB_QUEUES.DELETE_UNVERIFIED_USER, data: { phone } },
            {
                delay: UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS,
                jobId: `delete-user-${phone}`,
                removeOnComplete: true,
                removeOnFail: true,
            }
        );
        // Send email
        sendEmail({
            to: "hitechsidu992@gmail.com",
            subject: "OTP Service",
            template: "otp-verification-email.html",
            data: {
                otp
            },
            rawFields: [""],
        }).catch((err) =>
            logger.error("Failed to send reset email:", err.message)
        );
        return sendResponse({
            res,
            message: "OTP sent successfully",
        });
    } catch (err) {
        logger.error("Auth User Error:", err);
        return sendError(res, "Something went wrong. Please try again.");
    }
};

// RESEND OTP
export const sendOTP = async (req, res) => {
    try {
        const { phone } = req.body;

        const user = await User.findOne({ phone })
            .select("status is_verified")
            .lean();

        if (!user) {
            return sendError(
                res,
                "User not found. Please register first.",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (user.status === ACCOUNT_STATUS.BLOCKED) {
            return sendError(
                res,
                "Your account has been suspended.",
                STATUS_CODES.FORBIDDEN
            );
        }

        const isRateLimited = await checkOTPRateLimit(phone);
        if (isRateLimited) {
            return sendError(
                res,
                "Too many OTP requests. Please try again later.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        // Cooldown check prevent rapid resends
        const cooldownKey = `otp_cooldown:${phone}`;
        const cooldownExists = await get(cooldownKey);
        if (cooldownExists) {
            return sendError(
                res,
                "Please wait before requesting another OTP.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        const otp = await generateAndStoreOTP(phone);

        // Set cooldown using constant
        await set(cooldownKey, "1", "EX", OTP_COOLDOWN);

        if (process.env.NODE_ENV === "development") {
            logger.info(`[DEV] OTP for ${phone}: ${otp}`);
        }

        // Send email
        sendEmail({
            to: admin.email,
            subject: "OTP Service",
            template: "otp-verification-email.html",
            data: {
                otp
            },
            rawFields: [""],
        }).catch((err) =>
            logger.error("Failed to send reset email:", err.message)
        );

        return sendResponse({
            res,
            message: "OTP sent successfully",
        });
    } catch (err) {
        logger.error("Resend OTP Error:", err);
        return sendError(res, "Failed to send OTP");
    }
};

// VERIFY OTP
export const verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || typeof phone !== "string") {
            return sendError(
                res,
                "Phone number is required",
                STATUS_CODES.BAD_REQUEST
            );
        }

        if (!otp || typeof otp !== "string") {
            return sendError(
                res,
                "OTP is required",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const sanitizedPhone = phone.replace(/[^0-9+]/g, "");
        if (sanitizedPhone.length < 10 || sanitizedPhone.length > 15) {
            return sendError(
                res,
                "Invalid phone number format",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const sanitizedOtp = otp.replace(/[^0-9]/g, "");
        if (sanitizedOtp.length !== OTP_LENGTH) {
            return sendError(
                res,
                `OTP must be ${OTP_LENGTH} digits`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Check failed attempts
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

        const user = await User.findOne({ phone: sanitizedPhone })
            .select("_id status is_verified")
            .lean();

        if (!user) {
            return sendError(
                res,
                "Invalid or expired OTP",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        if (user.status === ACCOUNT_STATUS.BLOCKED) {
            return sendError(
                res,
                "Your account has been suspended.",
                STATUS_CODES.FORBIDDEN
            );
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

            return sendError(
                res,
                "Invalid or expired OTP",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        // Clean up all OTP-related keys
        await Promise.all([
            del(`otp:${sanitizedPhone}`),
            del(failKey),
            del(`otp_cooldown:${sanitizedPhone}`),
            del(`otp_rate:${sanitizedPhone}`),
            cancelJob(
                JOB_QUEUES.DELETE_UNVERIFIED_USER,
                `delete-user-${sanitizedPhone}`
            ),
        ]);

        const { accessToken, refreshToken } = await generateTokenPair(
            user._id
        );

        const now = new Date();
        const isFirstLogin = !user.is_verified;

        await User.findByIdAndUpdate(user._id, {
            $set: {
                is_verified: true,
                status: ACCOUNT_STATUS.ACTIVE,
                is_active: true,
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
                isFirstLogin,
                needsOnboarding: isFirstLogin,
            },
        });
    } catch (err) {
        if (process.env.NODE_ENV === "development") {
            logger.error("OTP Verification Error:", err);
        } else {
            logger.error("OTP Verification Error:", err.message);
        }
        return sendError(res, "OTP verification failed");
    }
};

//  REFRESH TOKEN
export const refreshToken = async (req, res) => {
    try {
        const { token, source } = extractRefreshToken(req);

        if (!token) {
            return sendError(
                res,
                "Refresh token required.",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        } catch (jwtErr) {
            clearAuthCookies(res);

            if (jwtErr.name === "TokenExpiredError") {
                return sendError(
                    res,
                    "Session expired. Please log in again.",
                    STATUS_CODES.UNAUTHORIZED
                );
            }
            return sendError(
                res,
                "Invalid refresh token",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        if (decoded.type !== TOKEN_TYPES.REFRESH) {
            return sendError(
                res,
                "Invalid token type",
                STATUS_CODES.UNAUTHORIZED
            );
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

        const user = await User.findById(decoded.auth_id)
            .select("status is_active")
            .lean();

        if (!user) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(
                res,
                "Account not found",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        if (user.status === ACCOUNT_STATUS.BLOCKED || !user.is_active) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(
                res,
                "Your account has been suspended.",
                STATUS_CODES.FORBIDDEN
            );
        }

        await del(redisKey);

        const { accessToken, refreshToken: newRefreshToken } =
            await generateTokenPair(decoded.auth_id);

        User.findByIdAndUpdate(decoded.auth_id, {
            last_active_at: new Date(),
        }).catch((err) =>
            logger.error("Failed to update last_active_at:", err)
        );

        return sendResponse({
            res,
            message: "Token refreshed successfully",
            data: {
                accessToken,
                refreshToken: newRefreshToken,
            },
        });
    } catch (err) {
        logger.error("Refresh Token Error:", err);
        clearAuthCookies(res);
        return sendError(
            res,
            "Session expired. Please log in again.",
            STATUS_CODES.UNAUTHORIZED
        );
    }
};

//  COMPLETE PROFILE
export const updateUserDetails = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { first_name, last_name, email, gender, dob, address, lat, lng } =
            req.body;

        const user = await User.findById(auth_id)
            .select("is_signup status")
            .lean();

        if (!user) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (user.is_signup) {
            return sendError(
                res,
                "Profile already completed. Use profile update instead.",
                STATUS_CODES.CONFLICT
            );
        }

        const emailExists = await User.findOne({
            email: email.toLowerCase(),
            _id: { $ne: auth_id },
        })
            .select("_id")
            .lean();

        if (emailExists) {
            return sendError(
                res,
                "Email already in use by another account",
                STATUS_CODES.CONFLICT
            );
        }

        const { isServiceable, serviceAreaId } =
            await checkServiceability(lat, lng);

        const updatedUser = await User.findByIdAndUpdate(
            auth_id,
            {
                $set: {
                    first_name: first_name.trim(),
                    last_name: last_name.trim(),
                    email: email.trim().toLowerCase(),
                    gender: gender.toLowerCase(),
                    dob: new Date(dob),
                    location: {
                        type: "Point",
                        coordinates: [lng, lat],
                        address: address,

                    },
                    is_signup: true,
                    is_serviceable: isServiceable,
                    service_area_id: serviceAreaId,
                    last_active_at: new Date(),
                },
            },
            { new: true, runValidators: true }
        )
            .select("-password_hash -__v")
            .lean();

        if (!updatedUser) {
            return sendError(
                res,
                "Failed to update profile",
                STATUS_CODES.INTERNAL_SERVER_ERROR
            );
        }

        // Invalidate cache
        await del(`user:profile:${auth_id}`);

        return sendResponse({
            res,
            message: "Profile completed successfully",
            data: {
                user: updatedUser,
                isServiceable,
                ...(!isServiceable && {
                    serviceMessage:
                        "Your location is not currently in our service area. You'll be notified when we expand.",
                }),
            },
        });
    } catch (err) {
        logger.error("Update User Details Error:", err);
        return sendError(res, "Failed to update profile");
    }
};

// LOGOUT
export const logout = async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;

        if (token) {
            const decoded = jwt.decode(token);
            if (decoded?.auth_id && decoded?.token_id) {
                await del(
                    `refresh:${decoded.auth_id}:${decoded.token_id}`
                );
            }
        }

        clearAuthCookies(res);

        return sendResponse({
            res,
            message: "Logged out successfully",
        });
    } catch (err) {
        clearAuthCookies(res);
        logger.error("Logout Error:", err);
        return sendResponse({
            res,
            message: "Logged out successfully",
        });
    }
};

