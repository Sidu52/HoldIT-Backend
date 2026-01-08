import { get, del, set, ttl } from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import { ACCOUNT_STATUS, STATUS_CODES, REFRESH_TOKEN_EXPIRY, ACCESS_TOKEN_EXPIRY, } from "../../utils/constants.js";
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken } from "../../utils/token.js";
import { v4 as uuidv4 } from 'uuid';
import jwt from "jsonwebtoken";
import sendEmail from "../../mailer/emailService.js";

// Verify the invite token
export const verifyAdminInviteToken = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return sendError(res, "Token is required", STATUS_CODES.BAD_REQUEST);
        }

        const inviteDataStr = await get(`admin-invite:${token}`);
        if (!inviteDataStr) {
            return sendError(res, "Invalid or expired invite token", STATUS_CODES.UNAUTHORIZED);
        }

        const inviteData = JSON.parse(inviteDataStr);
        const admin = await Admin.findOne({ email: inviteData.email }).lean();

        if (!admin || admin.isVerified) {
            return sendError(res, "Invite no longer valid", STATUS_CODES.CONFLICT);
        }

        sendResponse({
            res,
            message: "Token verified successfully",
            data: {
                email: admin.email,
                role: admin.role,
                expiresIn: await ttl(`admin-invite:${token}`),
            },
        });
    } catch (err) {
        console.error("Verify Invite Error:", err);
        sendError(res, "Verification failed");
    }
};

// Admin Login
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return sendError(res, "Email and password are required", STATUS_CODES.BAD_REQUEST);
        }

        const admin = await Admin.findOne({ email })
            .select("+_id password_hash status role")
            .lean();

        if (!admin) {
            return sendError(res, "Invalid email or password", STATUS_CODES.UNAUTHORIZED);
        }

        if (admin.status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Account is not active", STATUS_CODES.FORBIDDEN);
        }
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return sendError(res, "Invalid email or password", STATUS_CODES.UNAUTHORIZED);
        }

        const tokenId = uuidv4();

        const accessToken = generateAccessToken({
            auth_id: admin._id,
            role: admin.role,
            type: "access",
        });

        const refreshToken = generateRefreshToken({
            auth_id: admin._id,
            token_id: tokenId,
            type: "refresh",
        });

        await set(
            `refresh:${admin._id}:${tokenId}`,
            "valid",
            "EX",
            REFRESH_TOKEN_EXPIRY
        );

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

        await Admin.updateOne(
            { _id: admin._id },
            { last_login_at: new Date() }
        );

        return sendResponse({
            res,
            message: "Admin login successful",
            data: {
                user: {
                    id: admin._id,
                    email: admin.email,
                    role: admin.role,
                },
            },
        });
    } catch (err) {
        console.error("Admin Login Error:", err);
        sendError(res, "Login failed");
    }
};

// Signup with the invite token
export const signUp = async (req, res) => {
    try {
        const { token } = req.query;
        const { first_name, last_name, phone, address, dateOfBirth, password, confirmPassword, gender } = req.body;

        if (!token || !password || !confirmPassword) {
            return sendError(res, "Token and password are required", STATUS_CODES.BAD_REQUEST);
        }

        if (password !== confirmPassword) {
            return sendError(res, "Passwords do not match", STATUS_CODES.BAD_REQUEST);
        }

        const inviteDataStr = await get(`admin-invite:${token}`);
        if (!inviteDataStr) {
            return sendError(res, "Invalid or expired invite token", STATUS_CODES.BAD_REQUEST);
        }

        const inviteData = JSON.parse(inviteDataStr);

        const admin = await Admin.findOne({ email: inviteData.email });
        if (!admin) {
            return sendError(res, "Admin not found", STATUS_CODES.NOT_FOUND);
        }

        if (admin.isVerified) {
            return sendError(res, "Admin already verified", STATUS_CODES.CONFLICT);
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await Admin.updateOne(
            { _id: admin._id },
            {
                first_name,
                last_name,
                phone,
                address,
                date_of_birth: dateOfBirth,
                password_hash: passwordHash,
                gender,
                isVerified: true,
                status: ACCOUNT_STATUS.ACTIVE
            }
        );

        await del(`admin-invite:${token}`);
        await del(`admin-invite-email:${admin.email}`);

        sendResponse({ res, message: "Admin account created successfully" });
    } catch (err) {
        console.error("Signup Error:", err);
        sendError(res, "Signup failed");
    }
};

// Admin Logout
export const adminLogout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (refreshToken) {
            try {
                const decoded = jwt.decode(refreshToken);
                if (decoded?.auth_id && decoded?.token_id) {
                    await del(`refresh:${decoded.auth_id}:${decoded.token_id}`);
                }
            } catch (err) {
                console.error("Redis delete failed:", err);
            }
        }

        // Clear cookies
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
        };
        res.clearCookie("accessToken", cookieOptions);
        res.clearCookie("refreshToken", cookieOptions);

        return sendResponse({ res, message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err);
        sendError(res, err);
    }
};

// Forgot password
export const createAdminForgotPasswordToken = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return sendError(res, "Email is required", STATUS_CODES.BAD_REQUEST);
        }

        const admin = await Admin.findOne({ email });
        if (!admin) {
            return sendError(res, "Admin not found", STATUS_CODES.NOT_FOUND);
        }

        // prevent multiple active tokens
        const existingToken = await get(`admin:forgot:email:${email}`);
        if (existingToken) {
            return sendError(res, "Reset link already sent. Please check your email.", STATUS_CODES.CONFLICT);
        }

        const token = crypto.randomBytes(32).toString("hex");

        const payload = {
            adminId: admin._id,
            email: admin.email,
        };

        await Promise.all([
            set(`admin:forgot:token:${token}`, JSON.stringify(payload), "EX", INVITE_TOKEN_EXPIRY),
            set(`admin:forgot:email:${email}`, token, "EX", INVITE_TOKEN_EXPIRY),
        ]);

        const resetLink = `${process.env.ADMIN_UI_URL}/admin/reset-password?token=${token}`;

        // Send email
        sendEmail(
            admin.email,
            'Password Reset Request',
            'password-reset-email.html',
            { first_name: 'John', reset_link: resetLink }
        );

        return sendResponse({
            res,
            message: "Password reset link sent successfully",
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        return sendError(res, "Failed to send reset password link");
    }
};

// Update password
export const updateAdminPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return sendError(res, "Token and new password are required", STATUS_CODES.BAD_REQUEST);
        }

        const data = await get(`admin:forgot:token:${token}`);
        if (!data) {
            return sendError(res, "Invalid or expired token", STATUS_CODES.BAD_REQUEST);
        }

        const { adminId, email } = JSON.parse(data);

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await Admin.findByIdAndUpdate(adminId, {
            password: hashedPassword,
        });

        // destroy token
        await Promise.all([
            del(`admin:forgot:token:${token}`),
            del(`admin:forgot:email:${email}`),
        ]);

        return sendResponse({
            res,
            message: "Password updated successfully",
        });

    } catch (error) {
        console.error("Update password error:", error);
        return sendError(res, "Failed to update password");
    }
};

// Verify forgot password token
export const verifyAdminForgotPasswordToken = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return sendError(res, "Token is required", STATUS_CODES.BAD_REQUEST);
        }

        const data = await get(`admin:forgot:token:${token}`);

        if (!data) {
            return sendError(res, "Invalid or expired token", STATUS_CODES.BAD_REQUEST);
        }

        const payload = JSON.parse(data);

        return sendResponse({
            res,
            message: "Token is valid",
            data: {
                adminId: payload.adminId,
                email: payload.email,
            },
        });

    } catch (error) {
        console.error("Verify token error:", error);
        return sendError(res, "Token verification failed");
    }
};

// Update password
export const resetPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return sendError(res, "Passwords are required", STATUS_CODES.BAD_REQUEST);
        }

        const admin = await Admin.findById(auth_id).select("+password_hash");
        if (!admin) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        const isValid = await bcrypt.compare(oldPassword, admin.password_hash);
        if (!isValid) {
            return sendError(res, "Invalid old password", STATUS_CODES.UNAUTHORIZED);
        }

        admin.password_hash = await bcrypt.hash(newPassword, 12);
        await admin.save();

        // Invalidate all refresh tokens
        await del(`refresh:${auth_id}:*`);

        // Clear cookies
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
        };
        res.clearCookie("accessToken", cookieOptions);
        res.clearCookie("refreshToken", cookieOptions);

        sendResponse({ res, message: "Password updated successfully" });
    } catch (err) {
        console.error("Update Password Error:", err);
        sendError(res, "Password update failed");
    }
};

