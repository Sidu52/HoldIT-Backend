import { get, del, set, ttl } from "../services/redisService.js";
import { sendError, sendResponse } from "../utils/apiResponse.js";
import Admin from "../models/admin.js";
import { ACCOUNT_STATUS, USER_ROLES, STATUS_CODES, REFRESH_TOKEN_EXPIRY, ACCESS_TOKEN_EXPIRY, INVITE_TOKEN_EXPIRY } from "../utils/constants.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";
import { v4 as uuidv4 } from 'uuid';
import jwt from "jsonwebtoken";

// Signup with the invite token
export const signUp = async (req, res) => {
    try {
        const { token } = req.query;
        const { username, phone, address, dateOfBirth, password, confirmPassword, gender } = req.body;

        if (!token || !password) {
            return sendResponse({
                res,
                message: "Token and password are required",
                statusCode: 400
            });
        }
        // Get invite data from Redis
        const adminDetail = await get(`admin-invite:${token}`);
        if (!adminDetail) {
            return sendError(res, 'Invalid or expired invite token', STATUS_CODES.BAD_REQUEST);
        }

        const adminDetailObj = JSON.parse(adminDetail);

        // Verify token
        if (token != adminDetailObj.token) {
            return sendError(res, 'Token verification failed', STATUS_CODES.BAD_REQUEST);
        }

        // Check password match
        if (password !== confirmPassword) {
            return sendError(res, 'Passwords do not match', STATUS_CODES.BAD_REQUEST);
        }

        // Check if admin already verified
        const existingAdmin = await Admin.findOne({ email: adminDetailObj.email });
        if (existingAdmin && existingAdmin.isVerified) {
            return sendError(res, 'Admin account already verified', STATUS_CODES.CONFLICT);
        }


        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Update admin
        await Admin.findOneAndUpdate({ email: adminDetailObj.email }, {
            name: username,
            phone: phone,
            address: address,
            date_of_birth: dateOfBirth,
            password_hash: passwordHash,
            isVerified: true,
            gender,
            last_login_at: new Date()
        });

        // Cleanup Redis
        await del(`admin-invite:${token}`);

        sendResponse({
            res,
            message: "Admin account created successfully"
        });
    } catch (err) {
        console.error(err);
        sendError(res, err);
    }
};

// Admin Login
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return sendError(res, "Email and password are required", STATUS_CODES.BAD_REQUEST);
        }

        const admin = await Admin.findOne({ email }).select("+password_hash");
        if (!admin) {
            return sendError(res, "Invalid email or password", STATUS_CODES.UNAUTHORIZED);
        }

        if (admin.role === USER_ROLES.ADMIN && admin.status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Account is not active", STATUS_CODES.FORBIDDEN);
        }

        const isPasswordMatched = await bcrypt.compare(password, admin.password_hash);
        if (!isPasswordMatched) {
            return sendError(res, "Invalid email or password", STATUS_CODES.UNAUTHORIZED);
        }

        const accessToken = generateAccessToken({
            auth_id: admin._id,
            role: admin.role,
            type: "access"
        });
        const tokenId = uuidv4();
        const refreshToken = generateRefreshToken({
            auth_id: admin._id,
            token_id: tokenId,
            type: "refresh"
        });

        // Store refresh token in Redis
        await set(
            `refresh:${admin._id}:${tokenId}`,
            refreshToken,
            "EX",
            REFRESH_TOKEN_EXPIRY
        );
        // ACCESS TOKEN COOKIE
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: ACCESS_TOKEN_EXPIRY * 1000,
        });

        // REFRESH TOKEN COOKIE
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: REFRESH_TOKEN_EXPIRY * 1000,
        });

        admin.last_login_at = new Date();
        await admin.save();

        return sendResponse({
            res,
            message: "Admin login successful",
            data: {
                user: {
                    id: admin._id,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                },
            },
        });

    } catch (err) {
        console.error("Admin login error:", err);
        sendError(res, err);
    }
};

// Create admin invite
export const createAdminInvite = async (req, res) => {
    try {
        const { email } = req.body;
        const { auth_id: inviterId } = req.user;

        console.log("email", email);
        console.log("inviterId", inviterId);

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return sendError(res, "Invalid email format", STATUS_CODES.BAD_REQUEST);
        }

        // Check if admin already exists and verified
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin && existingAdmin.isVerified) {
            return sendError(res, "Admin account already exists", STATUS_CODES.CONFLICT);
        }

        // Generate unique token
        const token = crypto.randomBytes(32).toString("hex");

        // Create admin if not exists
        if (!existingAdmin) {
            await Admin.create({
                email,
                role: USER_ROLES.ADMIN,
                isVerified: false,
                invited_by: inviterId,
                status: ACCOUNT_STATUS.PENDING,
            });
        }

        // Generate invite link
        const inviteLink = `${process.env.ADMIN_UI_URL}/admin/signup?token=${token}`;

        console.log("inviteLink", inviteLink)
        // Store invite token in Redis with 24h expiry
        await set(
            `admin-invite:${token}`,
            JSON.stringify({ email, token }),
            "EX",
            INVITE_TOKEN_EXPIRY
        );

        sendResponse({
            res,
            message: "Admin invite sent",
            data: { inviteLink },
        });
    } catch (err) {
        console.error("Create admin invite error:", err);
        sendError(res, err);
    }
};

// Verify the invite token
export const verifyAdminInviteToken = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token || typeof token !== "string") {
            return sendError(res, "Token is required", STATUS_CODES.BAD_REQUEST);
        }

        const adminDetailStr = await get(`admin-invite:${token}`);
        console.log("adminDetailStr", adminDetailStr)
        if (!adminDetailStr) {
            return sendError(res, "Invalid or expired invite token", STATUS_CODES.UNAUTHORIZED);
        }

        const adminDetail = JSON.parse(adminDetailStr); // Parse JSON from Redis

        const existingAdmin = await Admin.findOne({ email: adminDetail.email });
        if (existingAdmin && existingAdmin.isVerified) {
            return sendError(res, "Admin account already verified", STATUS_CODES.CONFLICT);
        }

        sendResponse({
            res,
            message: "Token verified successfully",
            data: {
                email: existingAdmin.email,
                role: existingAdmin.role,
                expiresIn: await ttl(`admin-invite:${token}`),
            },
        });
    } catch (err) {
        console.error("Verify admin invite error:", err);
        sendError(res, err);
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

// Update password
export const updatePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const { auth_id } = req.user;

        // Validate input
        if (!oldPassword || !newPassword) {
            return sendError(res, 'Old password and new password are required', STATUS_CODES.BAD_REQUEST);
        }

        // Prevent same password
        if (oldPassword === newPassword) {
            return sendError(res, 'New password must be different from old password', STATUS_CODES.BAD_REQUEST);
        }

        const admin = await Admin.findById(auth_id).select('+password_hash');
        if (!admin) {
            return sendError(res, 'User not found', STATUS_CODES.NOT_FOUND);
        }

        // Verify old password
        const isPasswordValid = await bcrypt.compare(oldPassword, admin.password_hash);
        if (!isPasswordValid) {
            return sendError(res, 'Invalid old password', STATUS_CODES.UNAUTHORIZED);
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 12);
        admin.password_hash = passwordHash;
        admin.updated_at = new Date();
        await admin.save();
        sendResponse({ res, message: "Password updated successfully" });
    } catch (err) {
        console.error("Update Password Error:", err);
        sendError(res, err);
    }
};

// Refresh Token
export const refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return sendError(res, "Refresh token missing", 401);
        }
        // VERIFY
        const decoded = jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );
        if (decoded.type !== "refresh") {
            return sendError(res, "Invalid refresh token", 401);
        }
        const redisKey = `refresh:${decoded.auth_id}:${decoded.token_id}`;
        const exists = await get(redisKey);
        if (!exists) {
            return sendError(res, "Token reuse detected", 403);
        }
        const admin = await Admin.findById(decoded.auth_id);
        if (!admin || admin.status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Unauthorized", 401);
        }
        // ROTATE refresh token
        await del(redisKey);
        const newTokenId = uuidv4();
        const newRefreshToken = generateRefreshToken({
            auth_id: admin._id,
            token_id: newTokenId,
            type: "refresh",
        });
        await set(
            `refresh:${admin._id}:${newTokenId}`,
            "valid",
            "EX",
            REFRESH_TOKEN_EXPIRY
        );
        const newAccessToken = generateAccessToken({
            auth_id: admin._id,
            role: admin.role,
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
        return sendResponse({ res, message: "Token refreshed" });

    } catch (err) {
        // res.clearCookie("refreshToken");
        console.log("error", err)
        return sendError(res, "Session expired", 401);
    }
};

// Get Bookings
export const getBookings = async (req, res) => {
    try {
        const bookings = await Booking.find();
        sendResponse({ res, message: "Bookings fetched successfully", data: bookings });
    } catch (err) {
        console.error("Get Bookings Error:", err);
        sendResponse({ res, message: "Get Bookings failed", statusCode: 500 });
    }
};

// Get Drivers
export const getDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find();
        sendResponse({ res, message: "Drivers fetched successfully", data: drivers });
    } catch (err) {
        console.error("Get Drivers Error:", err);
        sendResponse({ res, message: "Get Drivers failed", statusCode: 500 });
    }
};

// Get Stores
export const getStores = async (req, res) => {
    try {
        const stores = await Store.find();
        sendResponse({ res, message: "Stores fetched successfully", data: stores });
    } catch (err) {
        console.error("Get Stores Error:", err);
        sendResponse({ res, message: "Get Stores failed", statusCode: 500 });
    }
};

// Get Users
export const getUsers = async (req, res) => {
    try {
        const users = await User.find();
        sendResponse({ res, message: "Users fetched successfully", data: users });
    } catch (err) {
        console.error("Get Users Error:", err);
        sendResponse({ res, message: "Get Users failed", statusCode: 500 });
    }
};

// Get Super Admins
export const getSuperAdmins = async (req, res) => {
    try {
        const superAdmins = await Admin.find({ role: USER_ROLES.SUPER_ADMIN });
        sendResponse({ res, message: "Super Admins fetched successfully", data: superAdmins });
    } catch (err) {
        console.error("Get Super Admins Error:", err);
        sendResponse({ res, message: "Get Super Admins failed", statusCode: 500 });
    }
};

// Get Admins
export const getAdmins = async (req, res) => {
    try {
        const admins = await Admin.find({ role: USER_ROLES.ADMIN });
        sendResponse({ res, message: "Admins fetched successfully", data: admins });
    } catch (err) {
        console.error("Get Admins Error:", err);
        sendResponse({ res, message: "Get Admins failed", statusCode: 500 });
    }
};


