import StoreOwner from "../../models/StoreOwner.js";
import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { getCache, setCache, deleteCache, deleteManyCache, deleteByPattern, buildCacheKey } from "../../utils/cache.js";
import { clearAuthCookies } from "../../utils/token.js";
import { ACCOUNT_STATUS, STATUS_CODES, VERIFICATION_STATUS, CACHE_TTL } from "../../utils/constants.js";
import { escapeRegex } from "../../utils/helper.js";
import logger from "../../utils/logger.js";

const EXCLUDED_FIELDS = "-password_hash -__v";

// Key Builders
const ownerKey = (id) => buildCacheKey("store_owner", { id: String(id) });
const ownerListPattern = "store_owners:*";
const storeListPattern = "stores:*";

// CREATE
export const createStoreOwner = async (req, res) => {
    try {
        const { first_name, last_name, phone, email, gender, date_of_birth, address } = req.body;

        const conflict = await StoreOwner.findOne({
            $or: [{ phone }, ...(email ? [{ email }] : [])],
        }).select("_id phone").lean();

        if (conflict) {
            return sendError(
                res,
                conflict.phone === phone ? "Account with this phone already exists" : "Account with this email already exists",
                STATUS_CODES.CONFLICT
            );
        }

        const owner = await StoreOwner.create({
            first_name: first_name.trim(),
            last_name: last_name?.trim() ?? "",
            phone,
            email: email?.toLowerCase().trim() ?? null,
            gender: gender ?? null,
            date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
            address: address?.trim() ?? null,
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
        });

        await deleteByPattern(ownerListPattern);
        return sendResponse({ res, statusCode: STATUS_CODES.CREATED, message: "Store owner created successfully", data: { owner } });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(res, `A store owner with this ${field} already exists`, STATUS_CODES.CONFLICT);
        }
        logger.error("[createStoreOwner] Error:", err);
        return sendError(res, "Failed to create store owner");
    }
};

// GET LIST
export const getStoreOwners = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, account_status, verification_status,
            search, sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = buildCacheKey("store_owners", {
            page: pageNum, limit: limitNum,
            account_status, verification_status,
            search: search || "none", sort_by, sort_order,
        });

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Store owners fetched successfully", data: cached });

        const filter = {
            ...(account_status && { account_status }),
            ...(verification_status && { verification_status }),
        };

        if (search) {
            const r = { $regex: escapeRegex(search.trim()), $options: "i" };
            filter.$or = [{ first_name: r }, { last_name: r }, { phone: r }, { email: r }];
        }

        const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
        const skip = (pageNum - 1) * limitNum;

        const [owners, total] = await Promise.all([
            StoreOwner.find(filter).select(EXCLUDED_FIELDS).sort(sort).skip(skip).limit(limitNum).lean(),
            StoreOwner.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            owners,
            pagination: {
                currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
            },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.LIST);
        return sendResponse({ res, message: "Store owners fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getStoreOwners] Error:", err);
        return sendError(res, "Failed to fetch store owners");
    }
};

// GET BY ID
export const getStoreOwnerById = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const cacheKey = ownerKey(store_owner_id);

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Store owner fetched successfully", data: cached });

        const [owner, stores] = await Promise.all([
            StoreOwner.findById(store_owner_id).select(EXCLUDED_FIELDS).lean(),
            Store.find({ store_owner_id }).select("store_name is_online account_status verification_status location").lean(),
        ]);

        if (!owner) return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);

        const activeStoreCount = stores.filter((s) => s.account_status === ACCOUNT_STATUS.ACTIVE).length;

        const responseData = {
            ...owner,
            stores,
            store_count: stores.length,
            activeStoreCount,
            inactiveStoreCount: stores.length - activeStoreCount,
        };

        await setCache(cacheKey, responseData, CACHE_TTL.DETAIL);
        return sendResponse({ res, message: "Store owner fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getStoreOwnerById] Error:", err);
        return sendError(res, "Failed to fetch store owner");
    }
};

// UPDATE
export const updateStoreOwner = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const { auth_id } = req.user;
        const { first_name, last_name, phone, email, gender, date_of_birth, address } = req.body;

        const owner = await StoreOwner.findById(store_owner_id).select("_id phone email").lean();
        if (!owner) return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);

        if (phone || email) {
            const conflict = await StoreOwner.findOne({
                _id: { $ne: store_owner_id },
                $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
            }).select("_id phone email").lean();

            if (conflict) {
                return sendError(
                    res,
                    conflict.phone === phone ? "Phone already in use by another store owner" : "Email already in use by another store owner",
                    STATUS_CODES.CONFLICT
                );
            }
        }

        const updateFields = {
            updated_by: auth_id,
            ...(first_name && { first_name: first_name.trim() }),
            ...(last_name && { last_name: last_name.trim() }),
            ...(phone && { phone }),
            ...(email && { email: email.toLowerCase().trim() }),
            ...(gender && { gender }),
            ...(date_of_birth && { date_of_birth: new Date(date_of_birth) }),
            ...(address && { address: address.trim() }),
        };

        const updatedOwner = await StoreOwner.findByIdAndUpdate(
            store_owner_id, { $set: updateFields }, { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        await Promise.all([
            deleteCache(ownerKey(store_owner_id)),
            deleteByPattern(ownerListPattern),
        ]);

        return sendResponse({ res, message: "Store owner updated successfully", data: updatedOwner });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(res, `${field} already in use`, STATUS_CODES.CONFLICT);
        }
        logger.error("[updateStoreOwner] Error:", err);
        return sendError(res, "Failed to update store owner");
    }
};

// Helpers
const hasActiveBookings = async (storeIds) => {
    if (!storeIds.length) return false;
    const count = await Booking.countDocuments({ storeId: { $in: storeIds }, isActive: true });
    return count > 0;
};

const deactivateOwnerStores = async (storeIds, auth_id) => {
    if (!storeIds.length) return null;
    await Store.updateMany(
        { _id: { $in: storeIds } },
        { $set: { is_online: false, account_status: ACCOUNT_STATUS.INACTIVE, store_deactivated_reason: "Owner account deactivated", deactivated_at: new Date(), deactivated_by: auth_id } }
    );
    await Promise.all(storeIds.map((storeId) =>
        Promise.all([
            deleteByPattern(`refresh:${storeId}:*`),
            deleteByPattern(`access:${storeId}:*`),
        ])
    ));
};

// UPDATE STATUS
export const updateStoreOwnerStatus = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const { account_status, account_deactivated_reason } = req.body;
        const { auth_id } = req.user;

        const owner = await StoreOwner.findById(store_owner_id).select("account_status").lean();
        if (!owner) return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);
        if (owner.account_status === account_status) return sendError(res, `Store owner is already ${account_status}`, STATUS_CODES.CONFLICT);

        const isDeactivation = account_status === ACCOUNT_STATUS.BLOCKED || account_status === ACCOUNT_STATUS.INACTIVE;

        if (isDeactivation) {
            const storeIds = (await Store.find({ store_owner_id }).select("_id").lean()).map((s) => s._id);
            if (await hasActiveBookings(storeIds)) {
                return sendError(res, "Cannot deactivate: one or more stores have active or in-progress bookings.", STATUS_CODES.CONFLICT);
            }
            await deactivateOwnerStores(storeIds, auth_id);
        }

        const updatedOwner = await StoreOwner.findByIdAndUpdate(store_owner_id, {
            $set: {
                account_status, updated_by: auth_id,
                ...(isDeactivation
                    ? { account_deactivated_reason: account_deactivated_reason ?? null, deactivated_at: new Date(), deactivated_by: auth_id }
                    : { account_deactivated_reason: null, deactivated_at: null, deactivated_by: null }
                ),
            },
        }, { new: true }).select(EXCLUDED_FIELDS).lean();

        await Promise.all([
            deleteCache(ownerKey(store_owner_id)),
            deleteByPattern(ownerListPattern),
            isDeactivation && deleteByPattern(storeListPattern),
        ].filter(Boolean));

        if (isDeactivation) {
            clearAuthCookies(res);
        }

        return sendResponse({ res, message: "Store owner status updated successfully", data: updatedOwner });
    } catch (err) {
        logger.error("[updateStoreOwnerStatus] Error:", err);
        return sendError(res, "Failed to update store owner status");
    }
};

// BULK DEACTIVATE
export const bulkDeactivateStoreOwners = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const { auth_id } = req.user;

        if (!Array.isArray(ids) || ids.length === 0) {
            return sendError(res, "No store owner IDs provided", STATUS_CODES.BAD_REQUEST);
        }

        const activeOwners = await StoreOwner.find({ _id: { $in: ids }, account_status: ACCOUNT_STATUS.ACTIVE }).select("_id").lean();
        if (!activeOwners.length) return sendError(res, "No active store owners found with the provided IDs", STATUS_CODES.NOT_FOUND);

        const activeOwnerIds = activeOwners.map((o) => o._id);
        const storeIds = (await Store.find({ store_owner_id: { $in: activeOwnerIds } }).select("_id").lean()).map((s) => s._id);

        if (await hasActiveBookings(storeIds)) {
            return sendError(res, "Cannot deactivate: one or more stores have active or in-progress bookings.", STATUS_CODES.CONFLICT);
        }

        const [ownerResult] = await Promise.all([
            StoreOwner.updateMany(
                { _id: { $in: activeOwnerIds } },
                { $set: { account_status: ACCOUNT_STATUS.INACTIVE, account_deactivated_reason: reason ?? "Admin bulk deactivation", deactivated_at: new Date(), deactivated_by: auth_id, updated_by: auth_id } }
            ),
            deactivateOwnerStores(storeIds, auth_id),
        ]);

        await Promise.all([
            deleteManyCache(activeOwnerIds.map((id) => ownerKey(id))),
            deleteByPattern(ownerListPattern),
            storeIds.length && deleteByPattern(storeListPattern),
        ].filter(Boolean));

        if (ownerResult.modifiedCount > 0) {
            clearAuthCookies(res);
        }

        return sendResponse({
            res,
            message: `${ownerResult.modifiedCount} store owner(s) deactivated successfully`,
            data: { requested: ids.length, deactivated: ownerResult.modifiedCount, alreadyInactive: ids.length - activeOwners.length },
        });
    } catch (err) {
        logger.error("[bulkDeactivateStoreOwners] Error:", err);
        return sendError(res, "Failed to deactivate store owners");
    }
};