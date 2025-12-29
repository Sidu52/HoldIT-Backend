import User from "../models/User.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";
import redis from "../services/redisService.js";
import { generateOTP } from "../utils/otp.js";
import { sendResponse } from "../utils/apiResponse.js";
import AuthUser from "../models/AuthUsers.js";
import Driver from "../models/Driver.js";
import StoreOwner from "../models/StoreOwner.js";
import { ACCOUNT_STATUS, STATUS_CODES, USER_ROLES } from "../utils/constants.js";
import { addJobToQueue, cancelJob } from "../services/jobService.js";
import Admin from "../models/admin.js";

// AUTH USER
export const authUser = async (req, res, role) => {
  try {
    const { phone } = req.body;
    if (!phone) return sendResponse({ res, message: "Phone is required", statusCode: STATUS_CODES.BAD_REQUEST });

    // Check if user exists
    let authUser = await AuthUser.findOne({ phone });
    if (authUser && authUser.status === ACCOUNT_STATUS.BLOCKED) {
      return sendResponse({ res, message: "Inactive Account Connect With Customer Support.", statusCode: STATUS_CODES.BAD_REQUEST });
    } else if (authUser && authUser.status == ACCOUNT_STATUS.PENDING) {
      return sendResponse({ res, message: "Account under review. Please wait for admin to approve.", statusCode: STATUS_CODES.BAD_REQUEST });
    } else if (authUser && role !== authUser.role) {
      return sendResponse({ res, message: "Unauthorized", statusCode: STATUS_CODES.UNAUTHORIZED });
    }


    if (!authUser) {
      authUser = await AuthUser.create({
        phone,
        role,
        isVerified: false,
        status: ACCOUNT_STATUS.PENDING,
        last_login_at: new Date(),
      });
    }

    // Delete OTP if it exists
    await redis.del(`otp:${phone}`);
    // Generate OTP and store in Redis
    const otp = generateOTP();
    await redis.set(`otp:${phone}`, otp, "EX", 120);

    // Manage auto-delete job
    await cancelJob("delete-unverified-user", `delete-user-${phone}`);
    // Schedule the new auto-delete job for the unverified user after 24 hours
    await addJobToQueue("delete-unverified-user", { name: "delete-unverified-user", data: { phone } }, {
      delay: 24 * 60 * 60 * 1000,
      jobId: `delete-user-${phone}`,
      removeOnComplete: true,
      removeOnFail: true,
    });

    sendResponse({ res, data: { otp }, message: "OTP sent successfully" });

  } catch (err) {
    console.error("Auth Error:", err);
    sendResponse({ res, message: "Auth failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
  }
};

// ReSEND OTP
export const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    let user = await AuthUser.findOne({ phone });
    console.log("user", user);
    if (user && user.status === ACCOUNT_STATUS.BLOCKED || user.status === ACCOUNT_STATUS.DELETED) {
      return sendResponse({ res, message: "Inactive Account Connect With Customer Support.", statusCode: STATUS_CODES.BAD_REQUEST });
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

// VERIFY OTP
export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const authUser = await AuthUser.findOne({ phone });
    if (!authUser || authUser.status === ACCOUNT_STATUS.BLOCKED) return sendResponse({ res, message: "Auth user not found", statusCode: STATUS_CODES.NOT_FOUND });

    const savedOTP = await redis.get(`otp:${phone}`);

    if (!savedOTP || savedOTP !== otp) {
      return sendResponse({ res, message: "Invalid or expired OTP", statusCode: STATUS_CODES.UNAUTHORIZED });
    }


    authUser.isVerified = true;
    authUser.last_login_at = new Date();
    authUser.status = authUser.role === USER_ROLES.USER ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.PENDING;
    await authUser.save();

    // Upsert role-specific user
    const models = {
      [USER_ROLES.USER]: User,
      [USER_ROLES.DRIVER]: Driver,
      [USER_ROLES.STORE_KEEPER]: StoreOwner,
    };
    const Model = models[authUser.role];
    if (!Model) return sendResponse({ res, message: "Invalid role", statusCode: STATUS_CODES.BAD_REQUEST });

    await Model.findOneAndUpdate(
      { auth_user_id: authUser._id },
      { auth_user_id: authUser._id },
      { upsert: true, new: true }
    );

    // Generate tokens
    console.log("authUser", authUser._id);
    const accessToken = generateAccessToken({ auth_id: authUser._id, role: authUser.role });
    const refreshToken = generateRefreshToken({ auth_id: authUser._id });

    await redis.set(`refresh:${refreshToken}`, authUser._id.toString(), "EX", 7 * 86400);
    // Set the new refresh token in an HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set this to true if you use HTTPS
      maxAge: 7 * 86400 * 1000, // 7 days expiration
      sameSite: 'Strict',
    });
    await redis.del(`otp:${phone}`);
    await cancelJob("delete-unverified-user", `delete-user-${phone}`);
    return sendResponse({ res, data: { accessToken, refreshToken }, message: "Login successful" });

  } catch (err) {
    console.error("OTP Verification Error:", err);
    return sendResponse({ res, message: "OTP verification failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
  }
};

// REFRESH TOKEN
export const refresh = async (req, res) => {
  try {
    // const { refreshToken: oldRT } = req.body;
    const { refreshToken: oldRT } = req.cookies; // Get the refresh token from cookies
    const userId = await redis.get(`refresh:${oldRT}`);
    if (!userId) return sendResponse({ res, message: "Token reuse detected", statusCode: STATUS_CODES.FORBIDDEN });

    // Invalidate old token
    await redis.del(`refresh:${oldRT}`);
    // await RefreshToken.deleteOne({ token: oldRT });

    const user = await AuthUser.findById(userId);
    if (!user) return sendResponse({ res, message: "User not found", statusCode: STATUS_CODES.NOT_FOUND });

    const newAT = generateAccessToken({ auth_id: user._id, role: user.role });
    const newRT = generateRefreshToken({ auth_id: user._id });

    await redis.set(`refresh:${newRT}`, user._id.toString(), "EX", 7 * 86400);
    // await RefreshToken.create({ user: user._id, token: newRT, expiresAt: new Date(Date.now() + 7 * 86400 * 1000) });

    // Set the new refresh token in an HTTP-only cookie
    res.cookie('refreshToken', newRT, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set this to true if you use HTTPS
      maxAge: 7 * 86400 * 1000, // 7 days expiration
      sameSite: 'Strict',
    });

    sendResponse({ res, data: { accessToken: newAT, refreshToken: newRT }, message: "Refresh token successful" });

  } catch (err) {
    console.error("Refresh Token Error:", err);
    sendResponse({ res, message: "Refresh token failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
  }
};

// LOGOUT
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    const userId = await redis.get(`refresh:${refreshToken}`);
    if (!userId) return sendResponse({ res, message: "Token reuse detected", statusCode: STATUS_CODES.FORBIDDEN });

    const user = await User.findById(userId);
    // Check if the Token is for admin or super admin
    if (!user || user.role === USER_ROLES.ADMIN || USER_ROLES.SUPER_ADMIN) return sendResponse({ res, message: "Unauthorized", statusCode: STATUS_CODES.NOT_FOUND });

    await redis.del(`refresh:${rt}`);
    // Clear the refreshToken cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/',
    });

    sendResponse({ res, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout Error:", err);
    sendResponse({ res, message: "Logout failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
  }
};


// Verify Users
export const verifyUsersAccount = async (req, res) => {
  try {
    const { phone, email } = req.body;
    const { role } = req.user;
    const authUser = await AuthUser.findOneAndUpdate({ phone }, { $set: { isVerified: true } }, { new: true });
    console.log("authUser", authUser);
    if (authUser) return sendResponse({ res, message: "User verified successfully" });
    const adminUpdate = await Admin.findOneAndUpdate({ email }, { $set: { isVerified: true, status: ACCOUNT_STATUS.ACTIVE } }, { new: true });

    if (adminUpdate.role === USER_ROLES.ADMIN && role === USER_ROLES.ADMIN) return sendResponse({ res, message: "Unauthorized User", statusCode: STATUS_CODES.BAD_REQUEST });
    if (adminUpdate) return sendResponse({ res, message: "User verified successfully" });

    return sendResponse({ res, message: "User not found", statusCode: STATUS_CODES.NOT_FOUND });
  } catch (err) {
    console.error("Verify Users Error:", err);
    sendResponse({ res, message: "Verify Users failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
  }
};

// Update account
export const updateAccount = async (req, res) => {
  try {
    const { status, email, phone } = req.body;

    const authUser = await AuthUser.findOne({ email, phone });
    if (!authUser) {
      return sendResponse({ res, message: "User not found", statusCode: 404 });
    }

    Object.assign(authUser, { status });
    await authUser.save();
    sendResponse({ res, message: "Account updated successfully" });

  } catch (err) {
    console.error("Update Account Error:", err);
    sendResponse({ res, message: "Update Account failed", statusCode: 500 });
  }
};  
