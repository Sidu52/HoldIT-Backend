import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";
import AuthUser from "../../models/AuthUsers.js";
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
        const cacheKey = `users:${page}:${limit}:${status || "all"}:${search || "none"}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Users fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .select("-__v -password")
                .populate("auth_user_id", "phone role isVerified")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            User.countDocuments(filter),
        ]);

        const responseData = {
            users,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
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
            return sendError(res, "Invalid user ID", 400);
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
            .populate("auth_user_id", "phone role isVerified")
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
        const { id } = req.body;
        if (!id) {
            return sendError(res, "User ID is required", 400);
        }

        const user = await User.findById(id).session(session);
        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        const authUser = await AuthUser.findById(user.auth_user_id).session(session);
        if (!authUser) {
            return sendError(res, "Auth user not found", STATUS_CODES.NOT_FOUND);
        }

        if (!authUser.isVerified) {
            return sendError(res, "User not verified", STATUS_CODES.BAD_REQUEST);
        }

        // Whitelisted fields
        const userFields = [
            "first_name",
            "last_name",
            "email",
            "gender",
            "dob",
            "address",
            "status",
        ];

        userFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                user[field] = req.body[field];
            }
        });

        if (req.body.phone !== undefined) {
            authUser.phone = req.body.phone;
        }

        if (
            req.body.role &&
            Object.values(USER_ROLES).includes(req.body.role)
        ) {
            authUser.role = req.body.role;
        }

        await Promise.all([
            user.save({ session }),
            authUser.save({ session }),
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
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, "Invalid user ID", 400);
        }

        const user = await User.findById(id).session(session);
        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        user.status = status;

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

// Create User
export const createUser = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            first_name,
            last_name,
            email,
            phone,
            gender,
            dob,
            address,
            role,
        } = req.body;

        if (!email || !phone) {
            return sendError(res, "Email and phone are required", STATUS_CODES.BAD_REQUEST);
        }

        // Create Auth User
        const authUser = await AuthUser.create(
            [{
                phone,
                role: Object.values(USER_ROLES).includes(role)
                    ? role
                    : USER_ROLES.USER,
                isVerified: true,
            }],
            { session }
        );

        // Create User profile
        const user = await User.create(
            [{
                auth_user_id: authUser[0]._id,
                first_name,
                last_name,
                email,
                gender,
                dob,
                address,
                status: "active",
            }],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        // Invalidate users cache
        await set("users:*", "", "EX", 1);

        sendResponse({
            res,
            message: "User created successfully",
            data: user[0],
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(
                res,
                `${field} already exists`,
                STATUS_CODES.CONFLICT
            );
        }

        console.error("Create User Error:", err);
        sendError(res, "Failed to create user");
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
            { auth_user_id: 1 }
        ).session(session);

        if (!users.length) {
            return sendError(res, "Users not found", STATUS_CODES.NOT_FOUND);
        }

        const authUserIds = users
            .map(u => u.auth_user_id)
            .filter(Boolean);

        // Bulk delete
        await Promise.all([
            User.deleteMany({ _id: { $in: validIds } }).session(session),
            AuthUser.deleteMany({ _id: { $in: authUserIds } }).session(session)
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

