import mongoose from "mongoose";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, ACCOUNT_STATUS, BOOKING_STATUS } from "../../utils/constants.js";
import { safeAbortSession } from "../../utils/helper.js";

const LIST_CACHE_TTL = 120;
const DETAIL_CACHE_TTL = 300;
const EXCLUDED_FIELDS = "-__v";

// Statuses that block deactivation
const USER_BLOCKING_BOOKING_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED,
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED,
    BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.STORED,
    BOOKING_STATUS.RETURN_REQUESTED,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
];

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

export const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            is_active,
            is_verified,
            is_serviceable,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = {};

        if (status) filter.status = status;

        // ✅ Fixed: cast boolean strings from query
        if (is_active !== undefined) filter.is_active = is_active === "true";
        if (is_verified !== undefined) filter.is_verified = is_verified === "true";
        if (is_serviceable !== undefined) filter.is_serviceable = is_serviceable === "true";

        if (search) {
            const escaped = escapeRegex(search.trim());
            filter.$or = [
                { first_name: { $regex: escaped, $options: "i" } },
                { last_name: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
                { phone: { $regex: escaped, $options: "i" } },
            ];
        }

        const sortDir = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDir };

        const cacheKey = buildCacheKey("users", {
            page: pageNum, limit: limitNum,
            status, is_active, is_verified, is_serviceable,
            search, sort_by, sort_order,
        });

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

        await set(cacheKey, JSON.stringify(responseData), "EX", LIST_CACHE_TTL);

        return sendResponse({
            res,
            message: "Users fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("[getUsers] Error:", err);
        return sendError(res, "Failed to fetch users");
    }
};

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
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        await set(cacheKey, JSON.stringify(user), "EX", DETAIL_CACHE_TTL);

        return sendResponse({
            res,
            message: "User fetched successfully",
            data: user,
        });
    } catch (err) {
        console.error("[getUserById] Error:", err);
        return sendError(res, "Failed to fetch user");
    }
};


export const updateUserProfile = async (req, res) => {
    try {
        const { user_id } = req.params;
        const { auth_id } = req.user;
        const {
            first_name,
            last_name,
            gender,
            email,
            phone,
            dob,
        } = req.body;

        const user = await User.findById(user_id)
            .select("_id status")
            .lean();

        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        // Check if phone already exists for another user
       if (phone && user.phone !== phone) {
           const existingUser = await User.findOne({ phone })
               .select("_id")
               .lean();

           if (existingUser) {
               return sendError(
                   res,
                   "Phone already in use by another user",
                   STATUS_CODES.CONFLICT
               );
           }
       }

        const updateFields = {
            updated_by: auth_id,
            updated_at: new Date(),
            ...(first_name && { first_name: first_name.trim() }),
            ...(last_name && { last_name: last_name.trim() }),
            ...(email && { email: email.trim() }),
            ...(phone && { phone: phone }),
            ...(gender && { gender }),
            ...(dob && { dob: new Date(dob) }),
        };

        const updatedUser = await User.findByIdAndUpdate(
            user_id,
            { $set: updateFields },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        await invalidateUserCache(user_id);

        return sendResponse({
            res,
            message: "User profile updated successfully",
            data: updatedUser,
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(res, `${field} already exists`, STATUS_CODES.CONFLICT);
        }
        console.error("[updateUserProfile] Error:", err);
        return sendError(res, "Failed to update user profile");
    }
};

export const updateUserStatus = async (req, res) => {
    try {
        const { user_id } = req.params;
        const { status, reason, is_active } = req.body;
        const { auth_id } = req.user;

        const user = await User.findById(user_id)
            .select("status is_active")
            .lean();

        if (!user) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        // ✅ Check active bookings before deactivating
        const isDeactivating = is_active === false || status === ACCOUNT_STATUS.BLOCKED;
        if (isDeactivating) {
            const activeBookingCount = await Booking.countDocuments({
                userId: user_id,
                status: { $in: USER_BLOCKING_BOOKING_STATUSES },
                isActive: true,
            });

            if (activeBookingCount > 0) {
                return sendError(
                    res,
                    `Cannot deactivate user — ${activeBookingCount} active booking(s) in progress`,
                    STATUS_CODES.CONFLICT
                );
            }
        }

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

            if (status === ACCOUNT_STATUS.BLOCKED) {
                // ✅ Fixed: blocking should also deactivate
                updateData.is_active = false;
                updateData.block_reason = reason ?? null;
                updateData.blocked_at = new Date();
                updateData.blocked_by = auth_id;
                updateData.account_deactivated_reason = reason ?? null;
                updateData.deactivated_at = new Date();
                updateData.deactivated_by = auth_id;
            }

            // Unblocking — reactivate
            if (status === ACCOUNT_STATUS.ACTIVE) {
                updateData.is_active = true;
                updateData.block_reason = null;
                updateData.blocked_at = null;
                updateData.blocked_by = null;
                updateData.account_deactivated_reason = null;
                updateData.deactivated_at = null;
                updateData.deactivated_by = null;
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
                updateData.account_deactivated_reason = reason ?? null;
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

        await invalidateUserCache(user_id);

        return sendResponse({
            res,
            message: "User status updated successfully",
            data: updatedUser,
        });
    } catch (err) {
        console.error("[updateUserStatus] Error:", err);
        return sendError(res, "Failed to update user status");
    }
};

export const bulkDeactivateUsers = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { ids, reason } = req.body;
        const { auth_id } = req.user;

        // Find currently active users only
        const activeUsers = await User.find({
            _id: { $in: ids },
            is_active: true,
        })
            .select("_id")
            .session(session)
            .lean();

        if (activeUsers.length === 0) {
            await safeAbortSession(session);
            return sendError(
                res,
                "No active users found with the provided IDs",
                STATUS_CODES.NOT_FOUND
            );
        }

        const activeIds = activeUsers.map((u) => u._id);

        // Check active bookings for ALL users being deactivated
        const usersWithActiveBookings = await Booking.distinct("userId", {
            userId: { $in: activeIds },
            status: { $in: USER_BLOCKING_BOOKING_STATUSES },
            isActive: true,
        }).session(session);

        if (usersWithActiveBookings.length > 0) {
            await safeAbortSession(session);
            return sendError(
                res,
                `Cannot deactivate — ${usersWithActiveBookings.length} user(s) have active bookings in progress`,
                STATUS_CODES.CONFLICT
            );
        }

        // Fixed: updateMany now uses session
        const result = await User.updateMany(
            { _id: { $in: activeIds } },
            {
                $set: {
                    is_active: false,
                    account_deactivated_reason: reason,
                    deactivated_at: new Date(),
                    deactivated_by: auth_id,
                },
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        // Invalidate cache non-blocking
        Promise.all([
            ...activeIds.map((id) => del(`user:${id}`)),
            delByPattern("users:*"),
        ]).catch((err) => console.error("[bulkDeactivate] Cache invalidation error:", err));

        return sendResponse({
            res,
            message: `${result.modifiedCount} user(s) deactivated successfully`,
            data: {
                requested: ids.length,
                deactivated: result.modifiedCount,
                alreadyInactive: ids.length - activeUsers.length,
                skippedBookings: 0,
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("[bulkDeactivateUsers] Error:", err);
        return sendError(res, "Failed to deactivate users");
    }
};