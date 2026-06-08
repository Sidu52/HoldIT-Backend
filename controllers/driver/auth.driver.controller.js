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
    VERIFICATION_STATUS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_COOLDOWN,
    JOB_QUEUES,
    TOKEN_TYPES,
    OTP_FAIL_WINDOW_SECONDS,
    UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS
} from "../../utils/constants.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import { clearAuthCookies, timingSafeEqual, generateTokenPair, checkOTPRateLimit, generateAndStoreOTP } from "../../helpers/user/authHelper.js";
import logger from "../../utils/logger.js";
import NotificationService from "../../services/NotificationService.js";
import asyncHandler from "../../utils/asyncHandler.js";

// Login / Register
export const authDriver = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    if (!phone || typeof phone !== "string") {
        return sendError(
            res,
            "Phone number is required",
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

    let driver = await Driver.findOne({ phone: sanitizedPhone })
        .select("account_status verification_status")
        .lean();

    if (driver) {
        if (driver.account_status === ACCOUNT_STATUS.BLOCKED) {
            return sendError(
                res,
                "Your account has been suspended. Please contact support.",
                STATUS_CODES.FORBIDDEN
            );
        }
    } else {
        driver = await Driver.create({
            phone: sanitizedPhone,
            account_status: ACCOUNT_STATUS.PENDING,
            verification_status: VERIFICATION_STATUS.PENDING,
        });
    }

    const isRateLimited = await checkOTPRateLimit(sanitizedPhone);
    if (isRateLimited) {
        return sendError(
            res,
            "Too many OTP requests. Please try again later.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const otp = await generateAndStoreOTP(sanitizedPhone);

    await cancelJob(JOB_QUEUES.DELETE_UNVERIFIED_DRIVER, `delete-driver-${sanitizedPhone}`);
    await addJobToQueue(
        JOB_QUEUES.DELETE_UNVERIFIED_DRIVER,
        { name: JOB_QUEUES.DELETE_UNVERIFIED_DRIVER, data: { phone: sanitizedPhone } },
        {
            delay: UNVERIFIED_ACCOUNT_CLEANUP_DELAY_MS,
            jobId: `delete-driver-${sanitizedPhone}`,
            removeOnComplete: true,
            removeOnFail: true,
        }
    );
    await NotificationService.sendOTP(sanitizedPhone, otp);
    logger.info(`OTP sent successfully to ${sanitizedPhone}`);

    return sendResponse({
        res,
        message: "OTP sent successfully",
        data: process.env.NODE_ENV === "development" ? { otp } : {},
    });
});


// Resend OTP
export const sendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    if (!phone || typeof phone !== "string") {
        return sendError(
            res,
            "Phone number is required",
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

    const driver = await Driver.findOne({ phone: sanitizedPhone })
        .select("account_status verification_status")
        .lean();

    if (!driver) {
        return sendError(
            res,
            "User not found. Please register first.",
            STATUS_CODES.NOT_FOUND
        );
    }

    if (driver.account_status === ACCOUNT_STATUS.BLOCKED) {
        return sendError(
            res,
            "Your account has been suspended.",
            STATUS_CODES.FORBIDDEN
        );
    }

    const isRateLimited = await checkOTPRateLimit(sanitizedPhone);
    if (isRateLimited) {
        return sendError(
            res,
            "Too many OTP requests. Please try again later.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const cooldownKey = `otp_cooldown:${sanitizedPhone}`;
    const cooldownExists = await get(cooldownKey);
    if (cooldownExists) {
        return sendError(
            res,
            "Please wait before requesting another OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const otp = await generateAndStoreOTP(sanitizedPhone);
    await set(cooldownKey, "1", "EX", OTP_COOLDOWN);
    await NotificationService.sendOTP(sanitizedPhone, otp);

    return sendResponse({
        res,
        message: "OTP sent successfully",
        data: process.env.NODE_ENV === "development" ? { otp } : {},
    });
});


// Verify OTP
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
        .select("_id account_status verification_status is_signup first_name last_name")
        .lean();

    if (!driver) {
        return sendError(
            res,
            "Invalid or expired OTP",
            STATUS_CODES.UNAUTHORIZED
        );
    }

    if (driver.account_status === ACCOUNT_STATUS.BLOCKED) {
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
    // FIX: Changed DELETE_UNVERIFIED_USER to DELETE_UNVERIFIED_DRIVER
    await Promise.all([
        del(`otp:${sanitizedPhone}`),
        del(failKey),
        del(`otp_cooldown:${sanitizedPhone}`),
        del(`otp_rate:${sanitizedPhone}`),
        cancelJob(
            JOB_QUEUES.DELETE_UNVERIFIED_DRIVER,
            `delete-driver-${sanitizedPhone}`
        ),
    ]);

    const { accessToken, refreshToken } = await generateTokenPair(
        driver._id,
        "driver",
        "/api/v1/driver/auth/refresh"
    );

    const now = new Date();
    // FIX: Check verification_status instead of is_verified
    const isFirstLogin = driver.verification_status !== VERIFICATION_STATUS.VERIFIED;

    // FIX: Update correct schema fields
    const updatedDriver = await Driver.findByIdAndUpdate(
        driver._id,
        {
            $set: {
                verification_status: VERIFICATION_STATUS.VERIFIED,
                account_status: ACCOUNT_STATUS.ACTIVE,
                last_login_at: now,
                last_active_at: now,
            },
        },
        { new: true }
    )
        .select("_id phone is_signup first_name last_name")
        .lean();

    if (!updatedDriver) {
        return sendError(
            res,
            "Failed to update driver",
            STATUS_CODES.INTERNAL_SERVER_ERROR
        );
    }

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


// Refresh Token
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
        .select("account_status verification_status")
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

    if (driver.account_status === ACCOUNT_STATUS.BLOCKED) {
        await del(redisKey);
        clearAuthCookies(res);
        return sendError(
            res,
            "Your account has been suspended.",
            STATUS_CODES.FORBIDDEN
        );
    }

    if (driver.verification_status !== VERIFICATION_STATUS.VERIFIED) {
        await del(redisKey);
        clearAuthCookies(res);
        return sendError(
            res,
            "Account verification required.",
            STATUS_CODES.FORBIDDEN
        );
    }

    await del(redisKey);

    const { accessToken, refreshToken: newRefreshToken } =
        await generateTokenPair(decoded.auth_id, "driver", "/api/v1/driver/auth/refresh");

    Driver.findByIdAndUpdate(decoded.auth_id, {
        last_active_at: new Date(),
    }).catch((err) =>
        logger.error("Failed to update last_active_at:", err.message)
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


//COMPLETE PROFILE
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

    if (!first_name || !last_name) {
        return sendError(
            res,
            "First name and last name are required",
            STATUS_CODES.BAD_REQUEST
        );
    }

    if (lat === undefined || lng === undefined) {
        return sendError(
            res,
            "Location coordinates are required",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
        return sendError(
            res,
            "Invalid coordinates format",
            STATUS_CODES.BAD_REQUEST
        );
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return sendError(
            res,
            "Coordinates out of valid range",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const driver = await Driver.findById(auth_id)
        .select("is_signup account_status")
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

    if (email && email.trim()) {
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
    }

    if (license_number) {
        const licenseExists = await Driver.findOne({
            license_number: license_number.trim(),
            _id: { $ne: auth_id },
        })
            .select("_id")
            .lean();

        if (licenseExists) {
            return sendError(
                res,
                "License number already in use by another driver",
                STATUS_CODES.CONFLICT
            );
        }
    }

    const { isServiceable, serviceAreaId } = await checkServiceability(longitude, latitude);

    const updateData = {
        first_name: first_name?.trim(),
        last_name: last_name?.trim(),
        is_signup: true,
        is_serviceable: isServiceable,
        service_area_id: serviceAreaId || null,
        currentLocation: {
            type: "Point",
            coordinates: [longitude, latitude],
            address: address?.trim() || null,
            updatedAt: new Date(),
        },
    };

    if (email?.trim()) {
        updateData.email = email.trim().toLowerCase();
    }

    if (gender) {
        updateData.gender = gender.toLowerCase();
    }

    if (date_of_birth) {
        const date_of_birth = new Date(date_of_birth);
        if (!isNaN(date_of_birth.getTime())) {
            updateData.date_of_birth = date_of_birth;
        }
    }

    if (address?.trim()) {
        updateData.address = address.trim();
    }

    if (vehicle_type) {
        updateData.vehicle_type = vehicle_type;
    }

    if (license_number?.trim()) {
        updateData.license_number = license_number.trim();
    }

    const updatedDriver = await Driver.findByIdAndUpdate(
        auth_id,
        { $set: updateData },
        { new: true, runValidators: true }
    )
        .select("-__v -documents")
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


//LOGOUT
export const logout = asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken;

    if (token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded?.auth_id && decoded?.token_id) {
                await del(`refresh:${decoded.auth_id}:${decoded.token_id}`);
                logger.info(`User ${decoded.auth_id} logged out successfully`);
            }
        } catch (err) {
            logger.warn("Failed to decode refresh token during logout:", err.message);
        }
    }

    clearAuthCookies(res);

    return sendResponse({
        res,
        message: "Logged out successfully",
    });
});
