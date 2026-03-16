import mongoose from "mongoose";
import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, ACCOUNT_STATUS } from "../../utils/constants.js";

// CONSTANTS
const LIST_CACHE_TTL = 120; // 2 minutes
const DETAIL_CACHE_TTL = 300; // 5 minutes
const EXCLUDED_FIELDS = "-password_hash -__v";

const ALLOWED_UPDATE_FIELDS = [
    "first_name",
    "last_name",
    "phone",
    "gender",
    "dob",
    "address",
];

// HELPERS
const escapeRegex = (str) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildCacheKey = (prefix, params) => {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`);
    return `${prefix}:${parts.join(":")}`;
};

const invalidateUserCache = async (userId = null) => {
    try {
        const promises = [delByPattern("users:*")];
        if (userId) promises.push(del(`user:${userId}`));
        await Promise.all(promises);
    } catch (err) {
        console.error("User cache invalidation error:", err);
    }
};

// GET USERS (Paginated + Filtered)
export const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            is_active,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter = {};

        if (status) filter.status = status;
        if (is_active !== undefined) filter.is_active = is_active;

        if (search) {
            const escaped = escapeRegex(search.trim());
            filter.$or = [
                { first_name: { $regex: escaped, $options: "i" } },
                { last_name: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
                { phone: { $regex: escaped, $options: "i" } },
            ];
        }

        // Build sort
        const sortDir = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDir };

        // Cache key
        const cacheKey = buildCacheKey("users", {
            page: pageNum,
            limit: limitNum,
            status,
            is_active,
            search,
            sort_by,
            sort_order,
        });

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Users fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Parallel queries
        const [users, total] = await Promise.all([
            User.find(filter)
                .select(EXCLUDED_FIELDS)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            User.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);

        const responseData = {
            users,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
            },
        };

        await set(
            cacheKey,
            JSON.stringify(responseData),
            "EX",
            LIST_CACHE_TTL
        );

        return sendResponse({
            res,
            message: "Users fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Users Error:", err);
        return sendError(res, "Failed to fetch users");
    }
};

// GET USER BY ID
export const getUserById = async (req, res) => {
    try {
        const { user_id } = req.params;

        const cacheKey = `user:${user_id}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "User fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const user = await User.findById(user_id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!user) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        await set(
            cacheKey,
            JSON.stringify(user),
            "EX",
            DETAIL_CACHE_TTL
        );

        return sendResponse({
            res,
            message: "User fetched successfully",
            data: user,
        });
    } catch (err) {
        console.error("Get User By ID Error:", err);
        return sendError(res, "Failed to fetch user");
    }
};

// UPDATE USER PROFILE
export const updateUserProfile = async (req, res) => {
    try {
        const { user_id } = req.params;

        // Build update from allowed fields only
        const updates = {};
        ALLOWED_UPDATE_FIELDS.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return sendError(
                res,
                "No valid fields to update",
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Check user exists and is active
        const existingUser = await User.findById(user_id)
            .select("is_active status")
            .lean();

        if (!existingUser) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (!existingUser.is_active) {
            return sendError(
                res,
                "Cannot update inactive user. Reactivate first.",
                STATUS_CODES.FORBIDDEN
            );
        }

        // Add audit fields
        updates.updated_by = req.user.auth_id;
        updates.updated_at = new Date();

        const updatedUser = await User.findByIdAndUpdate(
            user_id,
            { $set: updates },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Invalidate cache
        await invalidateUserCache(user_id);

        return sendResponse({
            res,
            message: "User profile updated successfully",
            data: updatedUser,
        });
    } catch (err) {
        // Handle duplicate key
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

// UPDATE USER STATUS
export const updateUserStatus = async (req, res) => {
    try {
        const { user_id } = req.params;
        const { status, reason, is_active } = req.body;
        const { auth_id } = req.user;

        const user = await User.findById(user_id)
            .select("status is_active")
            .lean();

        if (!user) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Build update
        const updateData = {
            updated_at: new Date(),
            status_updated_by: auth_id,
        };

        if (status !== undefined) {
            if (user.status === status) {
                return sendError(
                    res,
                    `User is already ${status}`,
                    STATUS_CODES.CONFLICT
                );
            }
            updateData.status = status;

            if (status === ACCOUNT_STATUS.BLOCKED && reason) {
                updateData.block_reason = reason;
                updateData.blocked_at = new Date();
                updateData.blocked_by = auth_id;
            }
        }

        if (is_active !== undefined) {
            if (user.is_active === is_active) {
                return sendError(
                    res,
                    `User is already ${is_active ? "active" : "inactive"}`,
                    STATUS_CODES.CONFLICT
                );
            }
            updateData.is_active = is_active;

            if (!is_active) {
                updateData.account_deactivated_reason = reason;
                updateData.deactivated_at = new Date();
                updateData.deactivated_by = auth_id;
            }

            if (is_active) {
                updateData.account_deactivated_reason = null;
                updateData.deactivated_at = null;
                updateData.deactivated_by = null;
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            user_id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Invalidate cache
        await invalidateUserCache(user_id);

        return sendResponse({
            res,
            message: "User status updated successfully",
            data: updatedUser,
        });
    } catch (err) {
        console.error("Update User Status Error:", err);
        return sendError(res, "Failed to update user status");
    }
};

// BULK DEACTIVATE USERS
export const bulkDeactivateUsers = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const { ids, reason } = req.body;
        const { auth_id } = req.user;

        // Find active users only
        const activeUsers = await User.find({
            _id: { $in: ids },
            is_active: true,
        })
            .select("_id")
            .session(session)
            .lean();

        if (activeUsers.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return sendError(
                res,
                "No active users found with the provided IDs",
                STATUS_CODES.NOT_FOUND
            );
        }

        const activeIds = activeUsers.map((u) => u._id);

        // Bulk deactivate
        const result = await User.updateMany(
            { _id: { $in: activeIds } },
            {
                $set: {
                    is_active: false,
                    account_deactivated_reason: reason,
                    deactivated_at: new Date(),
                    deactivated_by: auth_id,
                },
            }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        // Cache invalidation (non-blocking)
        Promise.all([
            ...activeIds.map((id) => del(`user:${id}`)),
            delByPattern("users:*"),
        ]).catch((err) =>
            console.error("Cache invalidation error:", err)
        );

        return sendResponse({
            res,
            message: `${result.modifiedCount} user(s) deactivated successfully`,
            data: {
                requested: ids.length,
                deactivated: result.modifiedCount,
                alreadyInactive: ids.length - activeUsers.length,
            },
        });
    } catch (err) {
        try {
            await session.abortTransaction();
        } catch (_) { }
        session.endSession();

        console.error("Bulk Deactivate Error:", err);
        return sendError(res, "Failed to deactivate users");
    }
};