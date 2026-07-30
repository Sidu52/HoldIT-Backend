import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, ACCOUNT_STATUS, VERIFICATION_STATUS, OTP_LENGTH, TOKEN_TYPES } from "../../utils/constants.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import {
    clearAuthCookies,
    timingSafeEqual,
    generateTokenPair,
    checkOTPRateLimit,
    generateAndStoreOTP,
} from "../../helpers/user/authHelper.js";
import { setAuthCookies } from "../../utils/helper.js";
import logger from "../../utils/logger.js";
import NotificationService from "../../services/NotificationService.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { generateOTP } from "../../utils/otp.js";
import { getCache, setCache, deleteCache, deleteByPattern, isKeyExist, incrementCache } from "../../constants/redis/redisOperation.js";
import { AuthKeys, AuthTTL } from "../../constants/redis/auth.keys.js";
import { UserKeys, UserTTL } from "../../constants/redis/user.keys.js";

// Helpers
async function issueOTP(phone) {
    const otp = generateOTP();
    await Promise.all([
        deleteCache(AuthKeys.otp("user", phone)),
        deleteCache(AuthKeys.otpFail("user", phone)),
        deleteCache(AuthKeys.otpCooldown("user", phone)),
        deleteCache(AuthKeys.otpRate("user", phone)),
        setCache(AuthKeys.otp("user", phone), otp, AuthTTL.OTP)
    ]);

    return otp;
}

async function getPendingUser(phone) {
    const raw = await getCache(AuthKeys.pendingUser(phone));
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
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
        if (existingUser.account_status === ACCOUNT_STATUS.BLOCKED ||
            existingUser.account_status === ACCOUNT_STATUS.INACTIVE) {
            return sendError(
                res,
                "Your account has been suspended. Please contact support.",
                STATUS_CODES.FORBIDDEN
            );
        }
    } else {
        const pendingPayload = JSON.stringify({ phone, createdAt: Date.now() });
        await setCache(AuthKeys.pendingUser(phone), pendingPayload, AuthTTL.PENDING_USER);
    }

    const isRateLimited = await checkOTPRateLimit("user", phone);
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

    const isRateLimited = await checkOTPRateLimit("user", phone);
    if (isRateLimited) {
        return sendError(
            res,
            "Too many OTP requests. Please try again later.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Prevent rapid resends (cooldown gate)
    const cooldownExists =  await isKeyExist(AuthKeys.otpCooldown("user", phone));
    if (cooldownExists) {
        return sendError(
            res,
            "Please wait before requesting another OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    const otp = await issueOTP(phone);

    // Re-apply cooldown AFTER issueOTP
    await setCache(AuthKeys.otpCooldown("user", phone), "1", AuthTTL.OTP_COOLDOWN);

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
    const failKey =  AuthKeys.otpFail("user", sanitizedPhone);
    const failCount = await getCache(failKey);

    if (failCount && parseInt(failCount, 10) >= OTP_MAX_ATTEMPTS) {
        await deleteCache(AuthKeys.otp("user", sanitizedPhone));
        return sendError(
            res,
            "Too many failed attempts. Please request a new OTP.",
            STATUS_CODES.TOO_MANY_REQUESTS
        );
    }

    // Fetch stored OTP
    let savedOTP = await getCache(AuthKeys.otp("user", sanitizedPhone));
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

    const redisKey = AuthKeys.refreshToken("user", decoded.auth_id, decoded.token_id);
    const storedToken = await getCache(redisKey);

    if (!storedToken) {
        await deleteByPattern(AuthKeys.refreshTokenPattern("user", decoded.auth_id));
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
        await deleteCache(redisKey);
        clearAuthCookies(res, "/api/v1/user/auth/refresh");
        return sendError(res, "Account not found.", STATUS_CODES.UNAUTHORIZED);
    }

    if (
        user.account_status === ACCOUNT_STATUS.INACTIVE ||
        user.account_status === ACCOUNT_STATUS.BLOCKED
    ) {
        await deleteCache(redisKey);
        clearAuthCookies(res, "/api/v1/user/auth/refresh");
        return sendError(res, "Your account has been suspended.", STATUS_CODES.FORBIDDEN);
    }
    await deleteCache(redisKey);

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
   try {
     const { auth_id } = req.user;
    const { first_name, last_name, email, gender, date_of_birth, address, lat, lng } = req.body;
    const user = await User.findById(auth_id).select("account_status").lean();

    if (!user) {
        return sendError(res, "User not found.", STATUS_CODES.NOT_FOUND);
    }

    const updateFields = {
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
    };

    if (Object.keys(updateFields).length === 1) {
        return sendError(res, "No fields provided to update", STATUS_CODES.BAD_REQUEST);    
    }

    let updatedUser;
    try {
        updatedUser = await User.findByIdAndUpdate(
            auth_id, { $set: updateFields }, { new: true, runValidators: true }
        ).select(ExcludedFields).lean();
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(res, `${field} already exists`, STATUS_CODES.CONFLICT);
        }
        throw err;
    }

    if (!updatedUser) return sendError(res, "Failed to update profile.", STATUS_CODES.INTERNAL_SERVER_ERROR);

    // Bust profile cache
    await deleteCache(UserKeys.profile(auth_id));

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
   } catch (err) {
        logger.error("[updateUserDetails] Error:", err);
        return sendError(res, "Failed to update profile");
   }

    // Email uniqueness check
    // const emailTaken = await User.findOne({
    //     email: email.toLowerCase().trim(),
    //     _id: { $ne: auth_id },
    // })
    //     .select("_id")
    //     .lean();

    // if (emailTaken) {
    //     return sendError(
    //         res,
    //         "Email is already associated with another account.",
    //         STATUS_CODES.CONFLICT
    //     );
    // }

    // const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);

    // // Build the address subdocument
    // const addressDoc = {
    //     street: address.trim(),
    //     city: "",
    //     state: "",
    //     postal_code: "",
    //     country: "",
    //     coordinates: [lng, lat],
    //     is_serviceable: isServiceable,
    //     is_default: true,
    // };

    // const updatedUser = await User.findByIdAndUpdate(
    //     auth_id,
    //     {
    //         $set: {
    //             first_name: first_name.trim(),
    //             last_name: last_name.trim(),
    //             email: email.trim().toLowerCase(),
    //             gender: gender.toLowerCase(),
    //             date_of_birth: new Date(date_of_birth),
    //             location: {
    //                 type: "Point",
    //                 coordinates: [lng, lat],
    //                 address: address.trim(),
    //             },
    //             is_serviceable: isServiceable,
    //             service_area_id: serviceAreaId || null,
    //             verification_status: VERIFICATION_STATUS.PROFILE_COMPLETE,
    //             last_active_at: new Date(),
    //         },
    //         // Push default address only if none exists
    //         $push: {
    //             addresses: {
    //                 $each: [addressDoc],
    //                 $slice: 10,
    //             },
    //         },
    //     },
    //     { new: true, runValidators: true }
    // )
    //     .select("-__v")
    //     .lean();

    // if (!updatedUser) {
    //     return sendError(res, "Failed to update profile.", STATUS_CODES.INTERNAL_SERVER_ERROR);
    // }

    // // Bust profile cache
    // await deleteUserProfileCache(auth_id);

    // return sendResponse({
    //     res,
    //     message: "Profile completed successfully",
    //     data: {
    //         user: updatedUser,
    //         isServiceable,
    //         ...(!isServiceable && {
    //             serviceMessage:
    //                 "Your location is not in our service area yet. We'll notify you when we expand.",
    //         }),
    //     },
    // });
});

// LOGOUT
export const logout = asyncHandler(async (req, res) => {
    const { token } = extractRefreshToken(req);

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
            if (decoded?.auth_id && decoded?.token_id) {
                await Promise.all([
                    deleteCache(AuthKeys.refreshToken("user", decoded.auth_id, decoded.token_id)),
                    deleteCache(AuthKeys.accessToken("user", decoded.auth_id, decoded.token_id)),
                ]);
            }
        } catch { }
    }

    clearAuthCookies(res, "/api/v1/user/auth/refresh");
    return sendResponse({ res, message: "Logged out successfully" });
});

// Private helpers
async function cleanupOTPKeys(phone) {
    await Promise.all([
        deleteCache(AuthKeys.otp("user", phone)),
        deleteCache(AuthKeys.otpFail("user", phone)),
        deleteCache(AuthKeys.otpCooldown("user", phone)),
        deleteCache(AuthKeys.otpRate("user", phone)),
        deleteCache(AuthKeys.pendingUser(phone)),
    ]);
}