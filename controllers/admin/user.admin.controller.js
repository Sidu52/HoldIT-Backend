import mongoose from "mongoose";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { getCache, setCache, deleteCache, deleteManyCache, deleteByPattern, buildCacheKey } from "../../utils/cache.js";
import { ACCOUNT_STATUS, STATUS_CODES, BOOKING_STATUS, CACHE_TTL } from "../../utils/constants.js";
import { escapeRegex } from "../../utils/helper.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import logger from "../../utils/logger.js";

const EXCLUDED_FIELDS = "-password_hash -__v";

// Key Builders
const userKey = (id) => buildCacheKey("user", { id: String(id) });
const userListPattern = "users:*";

const USER_BLOCKING_BOOKING_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED, BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED, BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.STORED, BOOKING_STATUS.RETURN_REQUESTED,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
].filter(Boolean);

const safeAbortSession = async (session) => {
    try { await session.abortTransaction(); session.endSession(); } catch (_) { }
};

// GET LIST
export const getUsers = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, account_status, search,
            sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = buildCacheKey("users", {
            page: pageNum, limit: limitNum,
            account_status, search: search || "none", sort_by, sort_order,
        });

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Users fetched successfully", data: cached });

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

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            users,
            pagination: {
                currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
            },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.LIST);
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
        const cacheKey = userKey(user_id);

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "User fetched successfully", data: cached });

        const user = await User.findById(user_id).select(EXCLUDED_FIELDS).lean();
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);

        await setCache(cacheKey, user, CACHE_TTL.DETAIL);
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

        const user = await User.findById(user_id).select("_id phone").lean();
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);

        if (email || phone) {
            const conflict = await User.findOne({
                _id: { $ne: user_id },
                $or: [
                    ...(email ? [{ email }] : []),
                    ...(phone && phone !== user.phone ? [{ phone }] : []),
                ],
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

        const updatedUser = await User.findByIdAndUpdate(
            user_id, { $set: updateFields }, { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        await Promise.all([deleteCache(userKey(user_id)), deleteByPattern(userListPattern)]);
        return sendResponse({ res, message: "User profile updated successfully", data: updatedUser });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(res, `${field} already exists`, STATUS_CODES.CONFLICT);
        }
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

        const user = await User.findById(user_id).select("account_status").lean();
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        if (user.account_status === account_status) return sendError(res, `User is already ${account_status}`, STATUS_CODES.CONFLICT);

        const isDeactivating = account_status === ACCOUNT_STATUS.BLOCKED || account_status === ACCOUNT_STATUS.INACTIVE;

        if (isDeactivating) {
            const activeBookingCount = await Booking.countDocuments({
                userId: user_id, status: { $in: USER_BLOCKING_BOOKING_STATUSES }, isActive: true,
            });
            if (activeBookingCount > 0) {
                return sendError(res, `Cannot deactivate user — ${activeBookingCount} active booking(s) in progress`, STATUS_CODES.CONFLICT);
            }
        }

        const updatedUser = await User.findByIdAndUpdate(user_id, {
            $set: {
                account_status,
                status_updated_by: auth_id,
                updated_by: auth_id,
                account_deactivated_reason: reason ?? null,
                ...(isDeactivating && { deactivated_at: new Date(), deactivated_by: auth_id }),
                ...(!isDeactivating && { deactivated_at: null, deactivated_by: null }),
            },
        }, { new: true, runValidators: true }).select(EXCLUDED_FIELDS).lean();

        await Promise.all([deleteCache(userKey(user_id)), deleteByPattern(userListPattern)]);
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

        const activeUsers = await User.find({ _id: { $in: ids }, account_status: ACCOUNT_STATUS.ACTIVE })
            .select("_id").session(session).lean();

        if (!activeUsers.length) {
            await safeAbortSession(session);
            return sendError(res, "No active users found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        const activeIds = activeUsers.map((u) => u._id);

        const usersWithActiveBookings = await Booking.distinct("userId", {
            userId: { $in: activeIds },
            status: { $in: USER_BLOCKING_BOOKING_STATUSES },
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

        await Promise.all([
            deleteManyCache(activeIds.map((id) => userKey(id))),
            deleteByPattern(userListPattern),
        ]);

        return sendResponse({
            res,
            message: `${result.modifiedCount} user(s) deactivated successfully`,
            data: { requested: ids.length, deactivated: result.modifiedCount, alreadyInactive: ids.length - activeUsers.length },
        });
    } catch (err) {
        await safeAbortSession(session);
        logger.error("[bulkDeactivateUsers] Error:", err);
        return sendError(res, "Failed to deactivate users");
    }
};

// UPDATE ADDRESS
export const updateUserAddress = async (req, res) => {
    try {
        const { userId, addressId } = req.params;

        const user = await User.findById(userId);
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);

        const addressIndex = user.addresses.findIndex((a) => a._id.toString() === addressId);
        if (addressIndex === -1) return sendError(res, "Address not found for this user", STATUS_CODES.NOT_FOUND);

        const { type, street, city, state, postal_code, country, coordinates, is_default } = req.body;

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
        await user.save();

        await deleteCache(userKey(userId));
        return sendResponse({ res, message: "Address updated successfully", data: { addresses: user.addresses } });
    } catch (err) {
        logger.error("[updateUserAddress] Error:", err);
        return sendError(res, "Internal server error");
    }
};

// ADD ADDRESS
export const addUserAddress = async (req, res) => {
    try {
        const { userId } = req.params;
        const { type, street, city, state, postal_code, country, coordinates, is_default } = req.body;

        const user = await User.findById(userId);
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);

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
        await user.save();

        await deleteCache(userKey(userId));
        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Address added successfully",
            data: { address: user.addresses[user.addresses.length - 1], addresses: user.addresses },
        });
    } catch (err) {
        logger.error("[addUserAddress] Error:", err);
        return sendError(res, "Internal server error");
    }
};

// DELETE ADDRESS
export const deleteUserAddress = async (req, res) => {
    try {
        const { userId, addressId } = req.params;

        const user = await User.findById(userId);
        if (!user) return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);

        const target = user.addresses.id(addressId);
        if (!target) return sendError(res, "Address not found for this user", STATUS_CODES.NOT_FOUND);

        const wasDefault = target.is_default;
        user.addresses.pull(addressId);

        if (wasDefault && user.addresses.length > 0) {
            user.addresses[0].is_default = true;
        }

        await user.save();
        await deleteCache(userKey(userId));
        return sendResponse({ res, message: "Address deleted successfully", data: { addresses: user.addresses } });
    } catch (err) {
        logger.error("[deleteUserAddress] Error:", err);
        return sendError(res, "Internal server error");
    }
};