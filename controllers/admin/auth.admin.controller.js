import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

import { get, del, set } from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import {
    generateAccessToken,
    generateRefreshToken,
} from "../../utils/token.js";
import {
    ACCOUNT_STATUS,
    STATUS_CODES,
    REFRESH_TOKEN_EXPIRY,
    ACCESS_TOKEN_EXPIRY,
    OTP_EXPIRY,
    TOKEN_TYPES,
} from "../../utils/constants.js";
import logger from "../../utils/logger.js";

// CONSTANTS (Derived from base constants)
const BCRYPT_SALT_ROUNDS = 12;
const FORGOT_PASSWORD_EXPIRY = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY * 24 * 60 * 60; // days → seconds
const ACCESS_TOKEN_EXPIRY_SECONDS = ACCESS_TOKEN_EXPIRY * 60; // minutes → seconds

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
};

// HELPER: Set Auth Cookies
const setAuthCookies = (res, accessToken, refreshToken) => {
    res.cookie("accessToken", accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: ACCESS_TOKEN_EXPIRY_SECONDS * 1000, // ms
    });

    res.cookie("refreshToken", refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_EXPIRY_SECONDS * 1000, // ms
    });
};

const clearAuthCookies = (res) => {
    res.clearCookie("accessToken", COOKIE_OPTIONS);
    res.clearCookie("refreshToken", COOKIE_OPTIONS);
};

// HELPER: Generate Token Pair
const generateTokenPair = async (admin) => {
    const tokenId = uuidv4();
    const accessToken = generateAccessToken({
        auth_id: admin._id,
        role: admin.role,
        type: TOKEN_TYPES.ACCESS,
    });

    const refreshToken = generateRefreshToken({
        auth_id: admin._id,
        token_id: tokenId,
        type: TOKEN_TYPES.REFRESH,
    });

    // Store refresh token reference in Redis
    await set(
        `refresh:${admin._id}:${tokenId}`,
        "valid",
        "EX",
        REFRESH_TOKEN_EXPIRY_SECONDS
    );

    return { accessToken, refreshToken };
};

// HELPER: Invalidate All Refresh Tokens
const invalidateAllRefreshTokens = async (adminId) => {
    const { keys } = await scanKeys(`refresh:${adminId}:*`);
    if (keys.length > 0) {
        await Promise.all(keys.map((key) => del(key)));
    }
};

// VERIFY INVITE TOKEN
export const verifyAdminInviteToken = async (req, res) => {
    try {
        const { token } = req.query;
        const inviteDataStr = await get(`admin-invite:${token}`);
        if (!inviteDataStr) {
            return sendError(
                res,
                "Invalid or expired invite token",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const inviteData = JSON.parse(inviteDataStr);
        const admin = await Admin.findOne({ email: inviteData.email })
            .select("email role is_verified")
            .lean();

        if (!admin) {
            return sendError(
                res,
                "Invite is no longer valid",
                STATUS_CODES.BAD_REQUEST
            );
        }

        if (admin.is_verified) {
            // Clean up the token since it's no longer needed
            await del(`admin-invite:${token}`);
            return sendError(
                res,
                "Account has already been activated",
                STATUS_CODES.CONFLICT
            );
        }

        return sendResponse({
            res,
            message: "Token verified successfully",
            data: {
                email: admin.email,
                role: admin.role,
            },
        });
    } catch (err) {
        logger.error("Verify Invite Error:", err);
        return sendError(res, "Verification failed");
    }
};

// ADMIN LOGIN
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email })
            // .select("_id email password_hash status role is_verified")
            .lean();

        if (!admin) {
            return sendError(
                res,
                "Invalid email or password",
                STATUS_CODES.UNAUTHORIZED
            );
        }
logger.info("admin",admin)
        if (!admin.is_verified) {
            return sendError(
                res,
                "Account not activated. Please complete signup first.",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (admin.status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(
                res,
                "Your account has been deactivated. Contact support.",
                STATUS_CODES.FORBIDDEN
            );
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return sendError(
                res,
                "Invalid email or password",
                STATUS_CODES.UNAUTHORIZED
            );
        }
        // Generate tokens
        const { accessToken, refreshToken } = await generateTokenPair(admin, admin.role);

        // Set cookies
        setAuthCookies(res, accessToken, refreshToken);

        // Update last login (fire and forget — non-critical)
        Admin.updateOne(
            { _id: admin._id },
            { last_login_at: new Date() }
        ).catch((err) => logger.error("Failed to update last login:", err));

        return sendResponse({
            res,
            message: "Login successful",
            data: {
                user: {
                    id: admin._id,
                    email: admin.email,
                    role: admin.role,
                },
            },
        });
    } catch (err) {
        logger.error("Admin Login Error:", err);
        return sendError(res, "Login failed");
    }
};

// SIGNUP
export const signUp = async (req, res) => {
    try {
        const {
            invite_token,
            first_name,
            last_name,
            phone,
            address,
            date_of_birth,
            password,
            confirm_password,
            gender,
        } = req.body;

        // Verify invite token
        const inviteDataStr = await get(`admin-invite:${invite_token}`);
        if (!inviteDataStr) {
            return sendError(
                res,
                "Invalid or expired invite token",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const inviteData = JSON.parse(inviteDataStr);

        const admin = await Admin.findOne({ email: inviteData.email });
        if (!admin) {
            return sendError(
                res,
                "Invite is no longer valid",
                STATUS_CODES.BAD_REQUEST
            );
        }

        if (admin.is_verified) {
            await del(`admin-invite:${invite_token}`);
            return sendError(
                res,
                "Account has already been activated",
                STATUS_CODES.CONFLICT
            );
        }

        if (password !== confirm_password) {
            return sendError(
                res,
                "Passwords do not match",
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        // Update admin record
        await Admin.updateOne(
            { _id: admin._id },
            {
                first_name,
                last_name,
                phone,
                address,
                date_of_birth,
                password_hash: passwordHash,
                gender,
                is_verified: true,
                status: ACCOUNT_STATUS.ACTIVE,
            }
        );

        // Cleanup invite tokens
        await Promise.all([
            del(`admin-invite:${invite_token}`),
            del(`admin-invite-email:${admin.email}`),
        ]);

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Account created successfully",
        });
    } catch (err) {
        logger.error("Signup Error:", err);
        return sendError(res, "Signup failed");
    }
};

// ADMIN LOGOUT
export const adminLogout = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            const decoded = jwt.decode(refreshToken);
            if (decoded?.auth_id && decoded?.token_id) {
                await del(`refresh:${decoded.auth_id}:${decoded.token_id}`);
            }
        }
        clearAuthCookies(res);

        return sendResponse({
            res,
            message: "Logged out successfully",
        });
    } catch (err) {
        clearAuthCookies(res);
        logger.error("Logout error:", err);
        return sendResponse({
            res,
            message: "Logged out successfully",
        });
    }
};

// FORGOT PASSWORD — Request Reset Link
export const createAdminForgotPasswordToken = async (req, res) => {
    try {
        const { email } = req.body;

        const admin = await Admin.findOne({ email })
            .select("_id email first_name status")
            .lean();

        const successMessage =
            "If an account with that email exists, a reset link has been sent.";

        if (!admin || admin.status !== ACCOUNT_STATUS.ACTIVE) {
            return sendResponse({ res, message: successMessage });
        }

        // Prevent multiple active tokens
        const existingToken = await get(`admin:forgot:email:${email}`);
        if (existingToken) {
            return sendResponse({ res, message: successMessage });
        }

        const token = crypto.randomBytes(32).toString("hex");

        const payload = {
            adminId: admin._id,
            email: admin.email,
        };

        await Promise.all([
            set(
                `admin:forgot:token:${token}`,
                JSON.stringify(payload),
                "EX",
                FORGOT_PASSWORD_EXPIRY
            ),
            set(
                `admin:forgot:email:${email}`,
                token,
                "EX",
                FORGOT_PASSWORD_EXPIRY
            ),
        ]);

        const resetLink = `${process.env.ADMIN_UI_URL}/admin/reset-password?token=${token}`;

        // Send email
        sendEmail({
            to: admin.email,
            subject: "Password Reset Request",
            template: "password-reset-email.html",
            data: {
                first_name: admin.first_name || "User",
                reset_link: resetLink,
            },
            rawFields: ["reset_link"],
        }).catch((err) =>
            logger.error("Failed to send reset email:", err.message)
        );

        return sendResponse({ res, message: successMessage });
    } catch (error) {
        logger.error("Forgot password error:", error);
        return sendError(res, "Failed to process request");
    }
};

// VERIFY FORGOT PASSWORD TOKEN
export const verifyAdminForgotPasswordToken = async (req, res) => {
    try {
        const { token } = req.query;

        const data = await get(`admin:forgot:token:${token}`);
        if (!data) {
            return sendError(
                res,
                "Invalid or expired reset token",
                STATUS_CODES.BAD_REQUEST
            );
        }

        return sendResponse({
            res,
            message: "Token is valid",
            data: { valid: true },
        });
    } catch (error) {
        logger.error("Verify token error:", error);
        return sendError(res, "Token verification failed");
    }
};

// FORGOT PASSWORD
export const updateAdminPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        const data = await get(`admin:forgot:token:${token}`);
        if (!data) {
            return sendError(
                res,
                "Invalid or expired reset token",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const { adminId, email } = JSON.parse(data);

        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        const result = await Admin.findByIdAndUpdate(adminId, {
            password_hash: hashedPassword,
        });

        if (!result) {
            return sendError(
                res,
                "Account not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Cleanup tokens
        await Promise.all([
            del(`admin:forgot:token:${token}`),
            del(`admin:forgot:email:${email}`),
            invalidateAllRefreshTokens(adminId),
        ]);

        return sendResponse({
            res,
            message: "Password updated successfully. Please login again.",
        });
    } catch (error) {
        logger.error("Update password error:", error);
        return sendError(res, "Failed to update password");
    }
};

// CHANGE PASSWORD
export const resetPassword = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { current_password, new_password } = req.body;

        const admin = await Admin.findById(auth_id).select("+password_hash");
        if (!admin) {
            return sendError(
                res,
                "Account not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        const isValid = await bcrypt.compare(
            current_password,
            admin.password_hash
        );
        if (!isValid) {
            return sendError(
                res,
                "Current password is incorrect",
                STATUS_CODES.UNAUTHORIZED
            );
        }

        // Prevent reusing the same password
        const isSamePassword = await bcrypt.compare(
            new_password,
            admin.password_hash
        );
        if (isSamePassword) {
            return sendError(
                res,
                "New password must be different from current password",
                STATUS_CODES.BAD_REQUEST
            );
        }

        admin.password_hash = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
        await admin.save();

        await invalidateAllRefreshTokens(auth_id);
        clearAuthCookies(res);

        return sendResponse({
            res,
            message: "Password changed successfully. Please login again.",
        });
    } catch (err) {
        logger.error("Change Password Error:", err);
        return sendError(res, "Password change failed");
    }
};

// VERIFY AUTH
export const verifyAuth = (req, res) => {
    return sendResponse({
        res,
        message: "Authenticated",
        data: {
            auth_id: req.user.auth_id,
            role: req.user.role,
        },
    });
};