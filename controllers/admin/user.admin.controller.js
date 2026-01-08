import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";
import { STATUS_CODES, USER_ROLES } from "../../utils/constants.js";
import mongoose from "mongoose";

// Get Users
export const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            search,
        } = req.query;

        const skip = (page - 1) * limit;

        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { phone: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { first_name: { $regex: search, $options: "i" } },
                { last_name: { $regex: search, $options: "i" } },
            ];
        }
        // filter.is_active = true;
        const cacheKey = `users:${page}:${limit}:${status || "all"}:${search || "none"}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Users fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const users = await User.find(filter)
            .select("-__v -password")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();

        const total = await User.countDocuments(filter);

        const responseData = {
            users,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: Number(limit),
            },
        };

        await set(cacheKey, JSON.stringify(responseData), "EX", 120);

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

// Get User by ID
export const getUserById = async (req, res) => {
    try {
        const { user_id: id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, "Invalid user ID", STATUS_CODES.BAD_REQUEST);
        }

        const cacheKey = `user:${id}`;
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "User fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const user = await User.findById(id)
            .select("-__v -password")
            .lean();

        if (!user) {
            return sendError(res, "User not found", 404);
        }

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
        const { user_id: id } = req.params;
        if (!id) {
            return sendError(res, "User ID is required", STATUS_CODES.BAD_REQUEST);
        }

        const user = await User.findById(id).session(session);
        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        if (!user.is_active) {
            return sendError(res, "User is not active", STATUS_CODES.FORBIDDEN);
        }

        // Whitelisted fields
        const userFields = [
            "first_name",
            "last_name",
            "email",
            "gender",
            "phone",
            "dob",
            "address",
        ];

        userFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                user[field] = req.body[field];
            }
        });

        if (
            req.body.role &&
            Object.values(USER_ROLES).includes(req.body.role)
        ) {
            authUser.role = req.body.role;
        }

        await Promise.all([
            user.save({ session }),
        ]);

        await session.commitTransaction();
        session.endSession();

        // Invalidate cache
        await Promise.all([
            set(`user:${id}`, "", "EX", 1),
            set("users:*", "", "EX", 1),
        ]);

        sendResponse({
            res,
            message: "User profile updated successfully",
            data: user,
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(res, `${field} already exists`, STATUS_CODES.CONFLICT);
        }

        console.error("Update User Profile Error:", err);
        sendError(res, "Failed to update user profile");
    }
};

// Update User Status
export const updateUserStatus = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { user_id: id } = req.params;
        const { status, reason, is_active } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, "Invalid user ID", 400);
        }

        const user = await User.findById(id, { is_active: true }).session(session);
        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        status && (user.status = status)
        reason && (user.account_deactivated_reason = reason)
        is_active != undefined && (user.is_active = is_active)

        await user.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Invalidate cache
        await set(`user:${id}`, "", "EX", 1);

        sendResponse({
            res,
            message: "User status updated successfully",
            data: user,
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(res, `${field} already exists`, STATUS_CODES.CONFLICT);
        }

        console.error("Update User Status Error:", err);
        sendError(res, "Failed to update user status");
    }
};

// Bulk Delete Users
export const bulkDeleteUsers = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { ids } = req.body;

        // Validate input
        if (!Array.isArray(ids) || ids.length === 0) {
            return sendError(res, "User IDs are required", STATUS_CODES.BAD_REQUEST);
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return sendError(res, "No valid user IDs provided", STATUS_CODES.BAD_REQUEST);
        }

        // Fetch users once
        const users = await User.find(
            { _id: { $in: validIds } },
        ).session(session);

        if (!users.length) {
            return sendError(res, "Users not found", STATUS_CODES.NOT_FOUND);
        }

        // Bulk Inactivate
        await Promise.all([
            User.updateMany({ _id: { $in: validIds } }, { is_active: false }).session(session),
        ]);

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        // Cache invalidation (non-blocking)
        Promise.all([
            ...validIds.map(id => set(`user:${id}`, "", "EX", 1)),
            set("users:*", "", "EX", 1)
        ]).catch(console.error);

        sendResponse({
            res,
            message: "Users deleted successfully",
            data: {
                deletedUsers: validIds.length
            }
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("Bulk Delete Users Error:", err);
        sendError(res, "Failed to delete users");
    }
};

