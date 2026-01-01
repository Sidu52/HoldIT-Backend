import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";
import AuthUser from "../../models/AuthUsers.js";
import { STATUS_CODES, USER_ROLES } from "../../utils/constants.js";
import mongoose from "mongoose";

export const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            search,
        } = req.params;

        const skip = (Number(page) - 1) * Number(limit);

        // filter
        const filter = {};
        if (status) filter.status = status;
        if (search) filter.phone = search;

        // Cache key
        const cacheKey = `users:${JSON.stringify({
            page,
            limit,
            status,
            search,
        })}`;

        // Redis cache check
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Users fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // DB query
        const [users, total] = await Promise.all([
            User.find(filter)
                .select("-__v -password -auth_user_id") // protect PII
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean()
                .populate("auth_user_id"),
            User.countDocuments(filter),
        ]);

        const responseData = {
            users,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
        };

        // Cache with SHORT TTL
        await set(cacheKey, JSON.stringify(responseData), "EX", 120); // ⏱ 2 minutes

        sendResponse({
            res,
            message: "Users fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Users Error:", err);
        sendError(res, "Failed to fetch users");
    }
};

export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        // Cache key
        const cacheKey = `user:${id}`;
        // Redis cache check
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "User fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // DB query
        const user = await User.findById(id)
            .select("-__v -password -auth_user_id")
            .lean()
            .populate("auth_user_id");

        if (!user) {
            return sendError(res, "User not found", 404);
        }

        // Cache with SHORT TTL
        await set(cacheKey, JSON.stringify(user), "EX", 120);

        sendResponse({
            res,
            message: "User fetched successfully",
            data: user,
        });
    } catch (err) {
        console.error("Get User Error:", err);
        sendError(res, "Failed to fetch user");
    }
};

// Update User Profile 
export const updateUserProfile = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            id,
            first_name,
            last_name,
            email,
            phone,
            gender,
            dob,
            address,
            status,
            role
        } = req.body;

        console.log("1")
        // Fetch user
        const user = await User.findById(id).session(session);
        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }
        console.log("2")
        // Fetch auth user
        const authUser = await AuthUser.findById(user.auth_user_id).session(session);
        if (!authUser) {
            return sendError(res, "Auth user not found", STATUS_CODES.NOT_FOUND);
        }

        if (!authUser.isVerified) {
            return sendError(res, "User not verified", STATUS_CODES.BAD_REQUEST);
        }
        console.log("3")
        // Update only provided fields
        if (first_name !== undefined) user.first_name = first_name;
        if (last_name !== undefined) user.last_name = last_name;
        if (email !== undefined) user.email = email;
        if (gender !== undefined) user.gender = gender;
        if (dob !== undefined) user.dob = dob;
        if (address !== undefined) user.address = address;
        if (status !== undefined) user.status = status;

        // Update only provided fields
        if (phone !== undefined) authUser.phone = phone;
        if (role && Object.values(USER_ROLES).includes(role)) {
            authUser.role = role;
        }
        console.log("4")
        await authUser.save({ session });
        await user.save({ session });
        console.log("5")
        await session.commitTransaction();
        session.endSession();
        console.log("6")
        return sendResponse({
            res,
            message: "User profile updated successfully",
            data: user
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        // Handle duplicate key error (email / phone)
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(
                res,
                `${field} already exists`,
                STATUS_CODES.CONFLICT
            );
        }
        console.error("Update User Profile Error:", err);
        return sendError(res, "Failed to update user profile");
    }
};
