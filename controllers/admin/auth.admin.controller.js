import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getCache, setCache, deleteCache, deleteByPattern } from "../../utils/cache.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import { ACCOUNT_STATUS, STATUS_CODES, TOKEN_TYPES, VERIFICATION_STATUS, REFRESH_TOKEN_EXPIRY } from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import { clearAuthCookies, setAuthCookies, generateRefreshToken, generateAccessToken } from "../../utils/token.js";
import { generateTokenPair } from "../../helpers/user/authHelper.js";

const BCRYPT_SALT_ROUNDS = 12;
const FORGOT_PASSWORD_EXPIRY = 60 * 60; // 1 hour in seconds

const REFRESH_KEY = (authId, tokenId) => `refresh:${authId}:${tokenId}`;
const INVITE_TOKEN_KEY = (token) => `admin:invite:token:${token}`;
const INVITE_EMAIL_KEY = (email) => `admin:invite:email:${email}`;
const FORGOT_TOKEN_KEY = (token) => `admin:forgot:token:${token}`;
const FORGOT_EMAIL_KEY = (email) => `admin:forgot:email:${email}`;

// VERIFY INVITE TOKEN
export const verifyAdminInviteToken = async (req, res) => {
    try {
        const { token } = req.query;
        const invite = await getCache(INVITE_TOKEN_KEY(token));
        if (!invite) return sendError(res, "Invalid or expired invite token", STATUS_CODES.BAD_REQUEST);

        return sendResponse({ res, message: "Token verified successfully", data: { email: invite.email, role: invite.role } });
    } catch (err) {
        logger.error("[verifyAdminInviteToken] Error:", err);
        return sendError(res, "Verification failed");
    }
};

// SIGNUP
export const signUp = async (req, res) => {
    try {
        const { invite_token, first_name, last_name, phone, address, date_of_birth, password, gender } = req.body;

        const invite = await getCache(INVITE_TOKEN_KEY(invite_token));
        if (!invite) return sendError(res, "Invalid or expired invite token", STATUS_CODES.BAD_REQUEST);

        const { email, role, inviterId } = invite;

        const existing = await Admin.findOne({ email }).select("verification_status").lean();
        if (existing?.verification_status === VERIFICATION_STATUS.VERIFIED) {
            await Promise.all([deleteCache(INVITE_TOKEN_KEY(invite_token)), deleteCache(INVITE_EMAIL_KEY(email))]);
            return sendError(res, "Account has already been verified", STATUS_CODES.CONFLICT);
        }

        await Admin.findByIdAndUpdate(existing._id, {
            first_name, last_name, phone, address, date_of_birth, gender,
            password_hash: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
            verification_status: VERIFICATION_STATUS.VERIFIED,
            account_status: ACCOUNT_STATUS.ACTIVE,
        });

        await Promise.all([deleteCache(INVITE_TOKEN_KEY(invite_token)), deleteCache(INVITE_EMAIL_KEY(email))]);

        return sendResponse({ res, statusCode: STATUS_CODES.CREATED, message: "Account created successfully. Please login." });
    } catch (err) {
        logger.error("[signUp] Error:", err);
        return sendError(res, "Signup failed");
    }
};

// LOGIN
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email }).lean();
        if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
            return sendError(res, "Invalid email or password", STATUS_CODES.UNAUTHORIZED);
        }

        if (admin.verification_status !== VERIFICATION_STATUS.VERIFIED) {
            return sendError(res, "Account not verified. Please contact support.", STATUS_CODES.FORBIDDEN);
        }

        if (admin.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Your account has been deactivated. Contact support.", STATUS_CODES.FORBIDDEN);
        }

        const { accessToken, refreshToken } = await generateTokenPair(admin._id, admin.role, "/api/v1/admin/auth/refresh");
        setAuthCookies(res, accessToken, refreshToken, "/api/v1/admin/auth/refresh");

        Admin.updateOne({ _id: admin._id }, { last_login_at: new Date() })
            .catch((err) => logger.error("Failed to update last login:", err));

        return sendResponse({ res, message: "Login successful", data: { id: admin._id, email: admin.email, role: admin.role } });
    } catch (err) {
        logger.error("[adminLogin] Error:", err);
        return sendError(res, "Login failed");
    }
};

// LOGOUT
export const adminLogout = async (req, res) => {
    try {
        const { token: refreshToken } = extractRefreshToken(req);
        if (refreshToken) {
            const decoded = jwt.decode(refreshToken);
            if (decoded?.auth_id && decoded?.token_id) {
                await deleteCache(REFRESH_KEY(decoded.auth_id, decoded.token_id));
            }
        }
        clearAuthCookies(res);
        return sendResponse({ res, message: "Logged out successfully" });
    } catch (err) {
        logger.error("[adminLogout] Error:", err);
        clearAuthCookies(res);
        return sendResponse({ res, message: "Logged out successfully" });
    }
};

// REFRESH TOKEN
export const refresh = async (req, res) => {
    try {
        const { token: refreshToken } = extractRefreshToken(req);
        if (!refreshToken) return sendError(res, "Refresh token missing", STATUS_CODES.UNAUTHORIZED);

        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        if (decoded.type !== TOKEN_TYPES.REFRESH) return sendError(res, "Invalid token type", STATUS_CODES.UNAUTHORIZED);

        const redisKey = REFRESH_KEY(decoded.auth_id, decoded.token_id);
        const stored = await getCache(redisKey);
        if (!stored) {
            clearAuthCookies(res);
            return sendError(res, "Token reuse detected", STATUS_CODES.FORBIDDEN);
        }

        const admin = await Admin.findById(decoded.auth_id).lean();
        if (!admin) return sendError(res, "Unauthorized", STATUS_CODES.UNAUTHORIZED);

        if (admin.account_status === ACCOUNT_STATUS.INACTIVE || admin.account_status === ACCOUNT_STATUS.BLOCKED) {
            clearAuthCookies(res);
            return sendError(res, "Account deactivated. Contact support.", STATUS_CODES.FORBIDDEN);
        }

        // Rotate: delete old, issue new
        await deleteCache(redisKey);
        const newTokenId = uuidv4();
        const newRefreshToken = generateRefreshToken({ auth_id: admin._id, role: admin.role, token_id: newTokenId, type: TOKEN_TYPES.REFRESH, path: decoded.path });
        const newAccessToken = generateAccessToken({ auth_id: admin._id, role: admin.role, type: TOKEN_TYPES.ACCESS });

        await setCache(REFRESH_KEY(admin._id, newTokenId), "valid", REFRESH_TOKEN_EXPIRY);
        setAuthCookies(res, newAccessToken, newRefreshToken, decoded.path);

        return sendResponse({ res, message: "Token refreshed" });
    } catch (err) {
        clearAuthCookies(res);
        logger.error("[refresh] Error:", err);
        return sendError(res, "Session expired", STATUS_CODES.UNAUTHORIZED);
    }
};

// FORGOT PASSWORD
export const createAdminForgotPasswordToken = async (req, res) => {
    try {
        const { email } = req.body;
        const successMessage = "If an account with that email exists, a reset link has been sent.";

        const admin = await Admin.findOne({ email }).select("_id email first_name account_status").lean();
        if (!admin || admin.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendResponse({ res, message: successMessage });
        }

        // prevent duplicate tokens
        const existing = await getCache(FORGOT_EMAIL_KEY(email));
        if (existing) return sendResponse({ res, message: successMessage });

        const token = crypto.randomBytes(32).toString("hex");

        await Promise.all([
            setCache(FORGOT_TOKEN_KEY(token), { adminId: admin._id, email }, FORGOT_PASSWORD_EXPIRY),
            setCache(FORGOT_EMAIL_KEY(email), token, FORGOT_PASSWORD_EXPIRY),
        ]);

        const resetLink = `${process.env.ADMIN_UI_URL}/admin/reset-password?token=${token}`;
        sendEmail({
            to: admin.email,
            subject: "Password Reset Request",
            template: "password-reset-email.html",
            data: { first_name: admin.first_name || "User", reset_link: resetLink },
            rawFields: ["reset_link"],
        }).catch((err) => logger.error("Failed to send reset email:", err.message));

        return sendResponse({ res, message: successMessage, ...(process.env.NODE_ENV === "development" && { data: { resetLink } }) });
    } catch (err) {
        logger.error("[createAdminForgotPasswordToken] Error:", err);
        return sendError(res, "Failed to process request");
    }
};

// VERIFY FORGOT PASSWORD TOKEN
export const verifyAdminForgotPasswordToken = async (req, res) => {
    try {
        const { token } = req.query;
        const data = await getCache(FORGOT_TOKEN_KEY(token));
        if (!data) return sendError(res, "Invalid or expired reset token", STATUS_CODES.BAD_REQUEST);

        return sendResponse({ res, message: "Token is valid", data: { valid: true } });
    } catch (err) {
        logger.error("[verifyAdminForgotPasswordToken] Error:", err);
        return sendError(res, "Token verification failed");
    }
};

// RESET PASSWORD
export const updateAdminPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        const data = await getCache(FORGOT_TOKEN_KEY(token));
        if (!data) return sendError(res, "Invalid or expired reset token", STATUS_CODES.BAD_REQUEST);

        const { adminId, email } = data;

        const result = await Admin.findByIdAndUpdate(adminId, { $set: { password_hash: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) } });
        if (!result) return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);

        await Promise.all([
            deleteCache(FORGOT_TOKEN_KEY(token)),
            deleteCache(FORGOT_EMAIL_KEY(email)),
            deleteByPattern(`refresh:${adminId}:*`),
        ]);

        return sendResponse({ res, message: "Password updated successfully. Please login again." });
    } catch (err) {
        logger.error("[updateAdminPassword] Error:", err);
        return sendError(res, "Failed to update password");
    }
};

// CHANGE PASSWORD 
export const resetPassword = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { current_password, new_password } = req.body;

        const admin = await Admin.findById(auth_id).select("+password_hash");
        if (!admin || admin.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Account is not active. Contact support.", STATUS_CODES.FORBIDDEN);
        }

        if (!(await bcrypt.compare(current_password, admin.password_hash))) {
            return sendError(res, "Current password is incorrect", STATUS_CODES.UNAUTHORIZED);
        }

        if (await bcrypt.compare(new_password, admin.password_hash)) {
            return sendError(res, "New password must be different from current password", STATUS_CODES.BAD_REQUEST);
        }

        admin.password_hash = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
        await admin.save();

        await deleteByPattern(`refresh:${auth_id}:*`);
        clearAuthCookies(res);

        return sendResponse({ res, message: "Password changed successfully. Please login again." });
    } catch (err) {
        logger.error("[resetPassword] Error:", err);
        return sendError(res, "Password change failed");
    }
};

// VERIFY AUTH
export const verifyAuth = (req, res) =>
    sendResponse({ res, message: "Authenticated", data: { auth_id: req.user.auth_id, role: req.user.role } });