import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import { ACCOUNT_STATUS, STATUS_CODES, TOKEN_TYPES, VERIFICATION_STATUS, REFRESH_TOKEN_EXPIRY } from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { extractRefreshToken } from "../../utils/extractToken.js";
import { clearAuthCookies, setAuthCookies, generateRefreshToken, generateAccessToken } from "../../utils/token.js";
import { generateTokenPair } from "../../helpers/user/authHelper.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";
import { AuthKeys } from "../../constants/redis/auth.keys.js";
import { deleteCache, getCache, setCache, deleteByPattern } from "../../constants/redis/redisOperation.js";
import { NS } from "../../constants/redis/namespaces.js";


const BCRYPT_SALT_ROUNDS = 12;


// VERIFY INVITE TOKEN
export const verifyAdminInviteToken = async (req, res) => {
    try {
        const { token } = req.query;
        const invite = await getCache(AdminKeys.inviteToken(token));
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

        const invite = await getCache(AdminKeys.inviteToken(invite_token));
        if (!invite) return sendError(res, "Invalid or expired invite token", STATUS_CODES.BAD_REQUEST);

        const { email, role, inviterId } = invite;

        const updateFields = {
            first_name, last_name, phone, address, date_of_birth, gender,
            password_hash: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
            verification_status: VERIFICATION_STATUS.VERIFIED,
            account_status: ACCOUNT_STATUS.ACTIVE,
        };

        if (!Object.keys(updateFields).length) {
            return sendError(res, "No fields provided to update", STATUS_CODES.BAD_REQUEST);
        }

        const updatedAdmin = await Admin.findOneAndUpdate(
            { email, verification_status: VERIFICATION_STATUS.PENDING },
            { $set: updateFields },
            { new: true, runValidators: true, context: "query" }
        ).select(ExcludedFields).lean();

        if (!updatedAdmin) {
            return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            deleteCache(AdminKeys.inviteToken(invite_token)),
            deleteCache(AdminKeys.invite(email)),
            setCache(AdminKeys.profile(updatedAdmin._id), updatedAdmin, AdminTTL.PROFILE),
        ]);

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

        await setCache(AdminKeys.profile(admin._id), admin, AdminTTL.PROFILE);

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
                await deleteCache(AuthKeys.refreshToken(decoded.auth_id, decoded.token_id));
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
console.log(refreshToken);
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        if (decoded.type !== TOKEN_TYPES.REFRESH) return sendError(res, "Invalid token type", STATUS_CODES.UNAUTHORIZED);

        console.log(decoded);

        const redisKey = AuthKeys.refreshToken(decoded.role, decoded.auth_id, decoded.token_id);
        const stored = await getCache(redisKey, AdminTTL.REFRESH_TOKEN_EXPIRY);

        console.log(redisKey, stored);

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

        const newTokenId = uuidv4();
        const newRefreshToken = generateRefreshToken({ auth_id: admin._id, role: admin.role, token_id: newTokenId, type: TOKEN_TYPES.REFRESH, path: decoded.path });
        const newAccessToken = generateAccessToken({ auth_id: admin._id, role: admin.role, type: TOKEN_TYPES.ACCESS });

        await setCache(AuthKeys.refreshToken(admin._id, newTokenId), "valid", REFRESH_TOKEN_EXPIRY);
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
        const existing = await getCache(AdminKeys.forgotEmail(email));
        if (existing) return sendResponse({ res, message: successMessage });

        const token = crypto.randomBytes(32).toString("hex");

        await Promise.all([
            setCache(AdminKeys.forgotToken(token), { adminId: admin._id, email }, AdminTTL.FORGOT_PASSWORD_EXPIRY),
            setCache(AdminKeys.forgotEmail(email), token, AdminTTL.FORGOT_PASSWORD_EXPIRY),
        ]);

        const resetLink = `${process.env.ADMIN_UI_URL}/reset-password?token=${token}`;
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
        const data = await getCache(AdminKeys.forgotToken(token));
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
        const { token } = req.query;
        const { password, confirm_password } = req.body;

        const data = await getCache(AdminKeys.forgotToken(token));
        if (!data) return sendError(res, "Invalid or expired reset token", STATUS_CODES.BAD_REQUEST);

        const { adminId, email } = data;
        if (password !== confirm_password) return sendError(res, "Passwords do not match", STATUS_CODES.BAD_REQUEST);

        const result = await Admin.findByIdAndUpdate(adminId, { $set: { password_hash: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) } });
        if (!result) return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);

        await Promise.all([
            deleteCache(AdminKeys.forgotToken(token)),
            deleteCache(AdminKeys.forgotEmail(email)),
            deleteByPattern(AuthKeys.refreshTokenPattern(NS.ADMIN, adminId)),
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

        admin.password_hash = new_password 
        await admin.save(); 


        await deleteByPattern(AuthKeys.refreshTokenPattern(NS.ADMIN, auth_id));
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