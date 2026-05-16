import jwt from "jsonwebtoken";
import Driver from "../../models/Driver.js";
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
import NotificationService from "../../services/NotificationService.js";
import asyncHandler from "../../utils/asyncHandler.js";



// LOGIN / REGISTER
export const authDriver = asyncHandler(async (req, res) => {
        const { phone } = req.body;

        let driver = await Driver.findOne({ phone })
            .select("status is_verified")
            .lean();

        if (driver) {
            if (driver.status === ACCOUNT_STATUS.BLOCKED) {
                return sendError(
                    res,
                    "Your account has been suspended. Please contact support.",
                    STATUS_CODES.FORBIDDEN
                );
            }
        } else {
            driver = await Driver.create({
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

        // Schedule cleanup of unverified drivers
        await cancelJob(JOB_QUEUES.DELETE_UNVERIFIED_DRIVER, `delete-driver-${phone}`);
        await addJobToQueue(
            JOB_QUEUES.DELETE_UNVERIFIED_DRIVER,
            { name: JOB_QUEUES.DELETE_UNVERIFIED_DRIVER, data: { phone } },
            {
                delay: UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS,
                jobId: `delete-driver-${phone}`,
                removeOnComplete: true,
                removeOnFail: true,
            }
        );
        // Send SMS/Email via abstract service
        await NotificationService.sendOTP(phone, otp);

        console.log("OTP sent successfully", otp);
        return sendResponse({
            res,
            message: "OTP sent successfully",
            data: { otp },
        });
});

// RESEND OTP
export const sendOTP = asyncHandler(async (req, res) => {
        const { phone } = req.body;

        const driver = await Driver.findOne({ phone })
            .select("status is_verified")
            .lean();

        if (!driver) {
            return sendError(
                res,
                "User not found. Please register first.",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (driver.status === ACCOUNT_STATUS.BLOCKED) {
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

        // Cooldown check — prevent rapid resends
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

        // Send SMS/Email via abstract service
        await NotificationService.sendOTP(phone, otp);

        return sendResponse({
            res,
            message: "OTP sent successfully",
            data: { otp },
        });
});

// VERIFY OTP
export const verifyOTP = asyncHandler(async (req, res) => {
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

        const driver = await Driver.findOne({ phone: sanitizedPhone })
            .select("_id status is_verified")
            .lean();

        if (!driver) {
            return sendError(
                res,
                "Invalid or expired OTP",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        if (driver.status === ACCOUNT_STATUS.BLOCKED) {
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
                `delete-driver-${sanitizedPhone}`
            ),
        ]);
        const { accessToken, refreshToken } = await generateTokenPair(driver._id, "driver");

        const now = new Date();
        const isFirstLogin = !driver.is_verified;

        const updatedDriver = await Driver.findByIdAndUpdate(driver._id, {
            $set: {
                is_verified: true,
                status: ACCOUNT_STATUS.ACTIVE,
                is_active: true,
                last_login_at: now,
                last_active_at: now,
            },
        }, { new: true }).lean();

        return sendResponse({
            res,
            message: "Login successful",
            data: {
                accessToken,
                refreshToken,
                driver: {
                    _id: updatedDriver._id,
                    phone: updatedDriver.phone,
                    is_signup: updatedDriver.is_signup,
                    firstName: updatedDriver.first_name,
                    lastName: updatedDriver.last_name,
                },
                isFirstLogin,
                needsOnboarding: !updatedDriver.is_signup,
            },
        });
});

//  REFRESH TOKEN
export const refreshToken = asyncHandler(async (req, res) => {
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

        const driver = await Driver.findById(decoded.auth_id)
            .select("status is_active")
            .lean();

        if (!driver) {
            await del(redisKey);
            clearAuthCookies(res);
            return sendError(
                res,
                "Account not found",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        if (driver.status === ACCOUNT_STATUS.BLOCKED || !driver.is_active) {
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
            await generateTokenPair(decoded.auth_id, "driver");

        Driver.findByIdAndUpdate(decoded.auth_id, {
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
});

//  COMPLETE PROFILE
export const updateDriverDetails = asyncHandler(async (req, res) => {
        const { auth_id } = req.user;
        const { 
            first_name, 
            last_name, 
            email, 
            gender, 
            date_of_birth, 
            address, 
            vehicle_type,
            license_number,
            lat, 
            lng 
        } = req.body;

        const driver = await Driver.findById(auth_id)
            .select("is_signup status")
            .lean();

        if (!driver) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (driver.is_signup) {
            return sendError(
                res,
                "Profile already completed. Use profile update instead.",
                STATUS_CODES.CONFLICT
            );
        }

        const emailExists = await Driver.findOne({
            email: email.trim().toLowerCase(),
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

        const updatedDriver = await Driver.findByIdAndUpdate(
            auth_id,
            {
                $set: {
                    first_name: first_name?.trim(),
                    last_name: last_name?.trim(),
                    email: email?.trim().toLowerCase(),
                    gender: gender?.toLowerCase(),
                    date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
                    address: address?.trim(),
                    vehicle_type,
                    license_number,
                    currentLocation: {
                        type: "Point",
                        coordinates: [lng, lat],
                        address: address?.trim(),
                    },
                    is_signup: true,
                    is_serviceable: isServiceable,
                    service_area_id: serviceAreaId,
                    service_area_id: serviceAreaId,
                },
            },
            { new: true, runValidators: true }
        )
            .select("-password_hash -__v")
            .lean();

        if (!updatedDriver) {
            return sendError(
                res,
                "Failed to update profile",
                STATUS_CODES.INTERNAL_SERVER_ERROR
            );
        }

        return sendResponse({
            res,
            message: "Profile completed successfully",
            data: {
                driver: updatedDriver,
                isServiceable,
                ...(!isServiceable && {
                    serviceMessage:
                        "Your location is not currently in our service area. You'll be notified when we expand.",
                }),
            },
        });
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
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
});