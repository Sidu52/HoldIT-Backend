import User from "../../models/User.js";
import Driver from "../../models/Driver.js";
import StoreOwner from "../../models/StoreOwner.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, ACCOUNT_STATUS, USER_ROLES, REFRESH_TOKEN_EXPIRY, ACCESS_TOKEN_EXPIRY } from "../../utils/constants.js";
import redis, { set, get, del } from "../../services/redisService.js";
import { generateOTP } from "../../utils/otp.js";
import { addJobToQueue, cancelJob } from "../../services/jobService.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/token.js";
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import Admin from "../../models/Admin.js";

// User authentication (login/signup) controller
export const authUser = async (req, res, role) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return sendError(
                res,
                "Phone number is required",
                STATUS_CODES.BAD_REQUEST
            );
        }
        // Fetch user
        let user = await AuthUser.findOne({ phone }).select("status role isVerified");
        // Existing user checks
        if (user) {
            if (user.status === ACCOUNT_STATUS.BLOCKED) {
                return sendResponse({
                    res,
                    message: "Inactive account. Please contact customer support.",
                    statusCode: STATUS_CODES.FORBIDDEN,
                });
            }
            if (user.status === ACCOUNT_STATUS.PENDING && user.isVerified === false) {
                return sendResponse({
                    res,
                    message: "Account under review. Please wait for admin approval.",
                    statusCode: STATUS_CODES.FORBIDDEN,
                });
            }
        } else {
            user = await AuthUser.create({
                phone,
                role,
                isVerified: false,
                last_active_at: new Date(),
                last_login_at: new Date(),
            });
        }
        // OTP handling with Redis transactions
        const otpKey = `otp:${phone}`;
        const otp = generateOTP();

        await redis.multi()
            .del(otpKey)
            .set(otpKey, otp, "EX", 120)
            .exec();

        // Manage auto-delete job
        await cancelJob( JOB_QUEUES.DELETE_UNVERIFIED_USER, `delete-user-${phone}`);
        // Schedule the new auto-delete job for the unverified user after 24 hours
        await addJobToQueue( JOB_QUEUES.DELETE_UNVERIFIED_USER, { name:  JOB_QUEUES.DELETE_UNVERIFIED_USER, data: { phone } }, {
            delay: 24 * 60 * 60 * 1000,
            jobId: `delete-user-${phone}`,
            removeOnComplete: true,
            removeOnFail: true,
        });
        return sendResponse({
            res,
            message: "OTP sent successfully",
            data: { otp },
        });

    } catch (err) {
        console.error("User login error:", err);
        return sendError(
            res,
            "Something went wrong. Please try again later.",
            STATUS_CODES.INTERNAL_SERVER_ERROR
        );
    }
};

// Resend OTP
export const sendOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ message: "Phone required" });

        let user = await AuthUser.findOne({ phone });
        if (user && user.isVerified) {
            return sendResponse({ res, message: "User already verified", statusCode: STATUS_CODES.CONFLICT });
        }

        // Delete OTP if it exists
        await redis.del(`otp:${phone}`);
        const otp = generateOTP();
        await redis.set(`otp:${phone}`, otp, "EX", 300);
        sendResponse({ res, data: { otp }, message: "OTP resent successfully" });
    } catch (err) {
        console.error(err);
        sendResponse({ res, message: "Failed to resend OTP", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Verify OTP
export const verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        const authUser = await AuthUser.findOne({ phone });
        if (!authUser || authUser.isVerified) return sendResponse({ res, message: "User already verified", statusCode: STATUS_CODES.CONFLICT });

        const savedOTP = await redis.get(`otp:${phone}`);

        if (!savedOTP || savedOTP !== otp) {
            return sendResponse({ res, message: "Invalid or expired OTP", statusCode: STATUS_CODES.UNAUTHORIZED });
        }

        authUser.isVerified = true;
        authUser.last_login_at = new Date();
        authUser.last_active_at = new Date();

        // Upsert role-specific user
        const models = {
            [USER_ROLES.USER]: User,
            [USER_ROLES.DRIVER]: Driver,
            [USER_ROLES.STORE_KEEPER]: StoreOwner,
        };
        const Model = models[authUser.role];
        if (!Model) return sendResponse({ res, message: "Invalid role", statusCode: STATUS_CODES.BAD_REQUEST });

        const tokenId = uuidv4();
        // Generate tokens
        const accessToken = generateAccessToken({
            auth_id: authUser._id,
            role: authUser.role,
            type: "access",
        });
        const refreshToken = generateRefreshToken({
            auth_id: authUser._id,
            token_id: tokenId,
            type: "refresh",
        });

        await set(
            `refresh:${authUser._id}:${tokenId}`,
            "valid",
            "EX",
            REFRESH_TOKEN_EXPIRY
        );
        // Set the new refresh token in an HTTP-only cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: ACCESS_TOKEN_EXPIRY * 1000,
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: REFRESH_TOKEN_EXPIRY * 1000,
        });

        await redis.del(`otp:${phone}`);
        await cancelJob( JOB_QUEUES.DELETE_UNVERIFIED_USER, `delete-user-${phone}`);

        await Model.findOneAndUpdate(
            { auth_user_id: authUser._id },
            { auth_user_id: authUser._id },
            { upsert: true, new: true }
        );
        await authUser.save();

        return sendResponse({ res, data: { accessToken, refreshToken }, message: "Login successful" });

    } catch (err) {
        console.error("OTP Verification Error:", err);
        return sendResponse({ res, message: "OTP verification failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Refresh Token
export const refresh = async (req, res, role) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return sendError(res, "Refresh token missing", STATUS_CODES.UNAUTHORIZED);
        }
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

        if (decoded.type !== "refresh") {
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
            type: "refresh",
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
            type: "access",
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
        console.error("Refresh Error:", err);
        sendError(res, "Session expired", STATUS_CODES.UNAUTHORIZED);
    }
};