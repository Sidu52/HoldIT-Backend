import mongoose from "mongoose";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { ACCOUNT_STATUS, STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import { escapeRegex, buildPagination, safeAbortSession } from "../../utils/helper.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import logger from "../../utils/logger.js";
import { cacheAside, deleteCache, deleteByPattern, deleteManyCache } from "../../constants/redis/redisOperation.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";
import { UserKeys, UserTTL } from "../../constants/redis/user.keys.js";
import { AuthKeys } from "../../constants/redis/auth.keys.js";
import { NS } from "../../constants/redis/namespaces.js";

const EXCLUDED_FIELDS = "-password_hash -__v";
const MAX_BULK_SIZE = 50;

const USER_BLOCKING_BOOKING_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED, BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED, BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.STORED, BOOKING_STATUS.RETURN_REQUESTED,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
].filter(Boolean);

const invalidateUserCache = async (userId) => {
    const results = await Promise.allSettled([
        deleteCache(AdminKeys.userDetail(userId)),
        deleteCache(UserKeys.profile(userId)),
        deleteCache(UserKeys.addressList(userId)),
        deleteByPattern(AdminKeys.userListPattern()),
    ]);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateUserCache]", r.reason?.message));
};

// GET LIST
export const getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, account_status, search, sort_by = "createdAt", sort_order = "desc" } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = AdminKeys.userList({ page: pageNum, limit: limitNum, account_status, search, sort_by, sort_order });

        const responseData = await cacheAside(cacheKey, AdminTTL.USER_LIST, async () => {
            const filter = { ...(account_status && { account_status }) };
            if (search) {
                const r = { $regex: escapeRegex(search.trim()), $options: "i" };
                filter.$or = [{ first_name: r }, { last_name: r }, { email: r }, { phone: r }];
            }

            const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
            const skip = (pageNum - 1) * limitNum;

            const [users, total] = await Promise.all([
                User.find(filter).select(EXCLUDED_FIELDS).sort(sort).skip(skip).limit(limitNum).lean(),
                User.countDocuments(filter),
            ]);

            return {
                users,
                pagination: buildPagination(pageNum, limitNum, total),
            };
        });

        return sendResponse({ res, message: "Users fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getUsers] Error:", err);
        return sendError(res, "Failed to fetch users");
    }
};

// GET BY ID
export const getUserById = async (req, res) => {
    try {
        const { user_id } = req.params;
        const user = await cacheAside(AdminKeys.userDetail(user_id), AdminTTL.USER_DETAIL, () => User.findById(user_id).select(EXCLUDED_FIELDS).lean());
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        return sendResponse({ res, message: "User fetched successfully", data: user });
    } catch (err) {
        logger.error("[getUserById] Error:", err);
        return sendError(res, "Failed to fetch user");
    }
};

// UPDATE PROFILE
export const updateUserProfile = async (req, res) => {
    try {
        const { user_id } = req.params;
        const { auth_id } = req.user;
        const { first_name, last_name, gender, email, phone, date_of_birth } = req.body;

        if (email || phone) {
            const conflict = await User.findOne({
                _id: { $ne: user_id },
                $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
            }).select("_id email phone").lean();
            if (conflict) {
                return sendError(
                    res,
                    conflict.email === email ? "Email already in use by another user" : "Phone already in use by another user",
                    STATUS_CODES.CONFLICT
                );
            }
        }

        const updateFields = {
            updated_by: auth_id,
            ...(first_name && { first_name: first_name.trim() }),
            ...(last_name && { last_name: last_name.trim() }),
            ...(email && { email: email.trim() }),
            ...(phone && { phone }),
            ...(gender && { gender }),
            ...(date_of_birth && { date_of_birth: new Date(date_of_birth) }),
        };

        let updatedUser;
        try {
            updatedUser = await User.findByIdAndUpdate(user_id, { $set: updateFields }, { new: true, runValidators: true }).select(EXCLUDED_FIELDS).lean();
        } catch (err) {
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern || {})[0] ?? "field";
                return sendError(res, `${field} already in use`, STATUS_CODES.CONFLICT);
            }
            throw err;
        }

        if (!updatedUser) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);

        await invalidateUserCache(user_id);
        return sendResponse({ res, message: "User profile updated successfully", data: updatedUser });
    } catch (err) {
        logger.error("[updateUserProfile] Error:", err);
        return sendError(res, "Failed to update user profile");
    }
};

// UPDATE STATUS
export const updateUserStatus = async (req, res) => {
    try {
        const { user_id } = req.params;
        const { account_status, reason } = req.body;
        const { auth_id } = req.user;

        const isDeactivating = account_status === ACCOUNT_STATUS.BLOCKED || account_status === ACCOUNT_STATUS.INACTIVE;

        if (isDeactivating) {
            const activeBookingCount = await Booking.countDocuments({
                userId: user_id, status: { $in: USER_BLOCKING_BOOKING_STATUSES }, isActive: true,
            });
            if (activeBookingCount > 0) {
                return sendError(res, `Cannot deactivate user — ${activeBookingCount} active booking(s) in progress`, STATUS_CODES.CONFLICT);
            }
        }

        const updatedUser = await User.findOneAndUpdate(
            { _id: user_id, account_status: { $ne: account_status } },
            {
                $set: {
                    account_status, status_updated_by: auth_id, updated_by: auth_id,
                    account_deactivated_reason: reason ?? null,
                    ...(isDeactivating ? { deactivated_at: new Date(), deactivated_by: auth_id } : { deactivated_at: null, deactivated_by: null }),
                },
            },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        if (!updatedUser) {
            const exists = await User.findById(user_id).select("account_status").lean();
            if (!exists) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
            return sendError(res, `User is already ${account_status}`, STATUS_CODES.CONFLICT);
        }

        const sideEffects = [invalidateUserCache(user_id)];
        if (isDeactivating) {
            sideEffects.push(deleteByPattern(AuthKeys.refreshTokenPattern(NS.USER, user_id)));
        }
        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[updateUserStatus] side effect failed:", r.reason?.message));

        return sendResponse({ res, message: "User status updated successfully", data: updatedUser });
    } catch (err) {
        logger.error("[updateUserStatus] Error:", err);
        return sendError(res, "Failed to update user status");
    }
};

// BULK DEACTIVATE
export const bulkDeactivateUsers = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { ids, reason } = req.body;
        const { auth_id } = req.user;

        if (!Array.isArray(ids) || ids.length === 0) {
            await safeAbortSession(session);
            return sendError(res, "No user IDs provided", STATUS_CODES.BAD_REQUEST);
        }
        if (ids.length > MAX_BULK_SIZE) {
            await safeAbortSession(session);
            return sendError(res, `Cannot process more than ${MAX_BULK_SIZE} accounts at once`, STATUS_CODES.BAD_REQUEST);
        }

        const uniqueIds = [...new Set(ids.map(String))];
        const activeUsers = await User.find({ _id: { $in: uniqueIds }, account_status: ACCOUNT_STATUS.ACTIVE }).select("_id").session(session).lean();
        if (!activeUsers.length) {
            await safeAbortSession(session);
            return sendError(res, "No active users found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        const activeIds = activeUsers.map((u) => u._id);
        const usersWithActiveBookings = await Booking.distinct("userId", {
            userId: { $in: activeIds }, status: { $in: USER_BLOCKING_BOOKING_STATUSES },
        }).session(session);

        if (usersWithActiveBookings.length > 0) {
            await safeAbortSession(session);
            return sendError(res, `Cannot deactivate — ${usersWithActiveBookings.length} user(s) have active bookings in progress`, STATUS_CODES.CONFLICT);
        }

        const result = await User.updateMany(
            { _id: { $in: activeIds } },
            { $set: { account_status: ACCOUNT_STATUS.INACTIVE, account_deactivated_reason: reason ?? null, deactivated_at: new Date(), deactivated_by: auth_id } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        const sideEffects = [
            deleteManyCache(activeIds.map((id) => AdminKeys.userDetail(id))),
            deleteManyCache(activeIds.map((id) => UserKeys.profile(id))),
            deleteByPattern(AdminKeys.userListPattern()),
            ...activeIds.map((id) => deleteByPattern(AuthKeys.refreshTokenPattern(NS.USER, id))),
        ];
        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[bulkDeactivateUsers] side effect failed:", r.reason?.message));

        return sendResponse({
            res,
            message: `${result.modifiedCount} user(s) deactivated successfully`,
            data: { requested: uniqueIds.length, deactivated: result.modifiedCount, alreadyInactive: uniqueIds.length - activeUsers.length },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[bulkDeactivateUsers] Error:", err);
        return sendError(res, "Failed to deactivate users");
    }
};

// UPDATE ADDRESS
export const updateUserAddress = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { userId, addressId } = req.params;
        const { type, street, city, state, postal_code, country, coordinates, is_default } = req.body;

        const user = await User.findById(userId).session(session);
        if (!user) {
            await safeAbortSession(session);
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        const addressIndex = user.addresses.findIndex((a) => a._id.toString() === addressId);
        if (addressIndex === -1) {
            await safeAbortSession(session);
            return sendError(res, "Address not found for this user", STATUS_CODES.NOT_FOUND);
        }

        const updates = {
            ...(type !== undefined && { type }),
            ...(street !== undefined && { street }),
            ...(city !== undefined && { city }),
            ...(state !== undefined && { state }),
            ...(postal_code !== undefined && { postal_code }),
            ...(country !== undefined && { country }),
            ...(coordinates !== undefined && { coordinates }),
            ...(is_default !== undefined && { is_default }),
        };

        if (updates.is_default === true) {
            user.addresses.forEach((addr, idx) => { addr.is_default = idx === addressIndex; });
        }

        if (updates.coordinates) {
            const { isServiceable: is_serviceable } = await checkServiceability(updates.coordinates[0], updates.coordinates[1]);
            user.location = { type: "Point", coordinates: updates.coordinates };
            user.is_serviceable = is_serviceable;
        }

        Object.assign(user.addresses[addressIndex], updates);
        user.markModified("addresses");
        await user.save({ session });

        await session.commitTransaction();
        session.endSession();

        await invalidateUserCache(userId);
        return sendResponse({ res, message: "Address updated successfully", data: { addresses: user.addresses } });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[updateUserAddress] Error:", err);
        return sendError(res, "Internal server error");
    }
};

// ADD ADDRESS
export const addUserAddress = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { userId } = req.params;
        const { type, street, city, state, postal_code, country, coordinates, is_default } = req.body;

        const user = await User.findById(userId).session(session);
        if (!user) {
            await safeAbortSession(session);
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        const newAddress = { type, street, city, state, postal_code, country, is_default: false };

        if (coordinates) {
            const { isServiceable: is_serviceable } = await checkServiceability(coordinates[0], coordinates[1]);
            newAddress.coordinates = coordinates;
            newAddress.is_serviceable = is_serviceable;
        }

        if (user.addresses.length === 0 || is_default) {
            user.addresses.forEach((a) => { a.is_default = false; });
            newAddress.is_default = true;
        }

        user.addresses.push(newAddress);
        user.markModified("addresses");
        await user.save({ session });

        await session.commitTransaction();
        session.endSession();

        await invalidateUserCache(userId);
        return sendResponse({
            res, statusCode: STATUS_CODES.CREATED, message: "Address added successfully",
            data: { address: user.addresses[user.addresses.length - 1], addresses: user.addresses },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[addUserAddress] Error:", err);
        return sendError(res, "Internal server error");
    }
};

// DELETE ADDRESS
export const deleteUserAddress = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { userId, addressId } = req.params;
        const user = await User.findById(userId).session(session);
        if (!user) {
            await safeAbortSession(session);
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        const target = user.addresses.id(addressId);
        if (!target) {
            await safeAbortSession(session);
            return sendError(res, "Address not found for this user", STATUS_CODES.NOT_FOUND);
        }

        const wasDefault = target.is_default;
        user.addresses.pull(addressId);

        // picks the MOST RECENTLY ADDED remaining address as new default, not array-order [0] —
        // confirm this matches intended UX; either is defensible, just making the choice explicit
        if (wasDefault && user.addresses.length > 0) {
            user.addresses[user.addresses.length - 1].is_default = true;
        }

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        await invalidateUserCache(userId);
        return sendResponse({ res, message: "Address deleted successfully", data: { addresses: user.addresses } });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[deleteUserAddress] Error:", err);
        return sendError(res, "Internal server error");
    }
};