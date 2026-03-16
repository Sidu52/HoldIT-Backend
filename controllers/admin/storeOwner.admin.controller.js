// controllers/admin/storeOwner.admin.controller.js

import StoreOwner from "../../models/StoreOwner.js";
import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, ACCOUNT_STATUS } from "../../utils/constants.js";

// ============================================
// CONSTANTS
// ============================================
const LIST_CACHE_TTL = 120;
const DETAIL_CACHE_TTL = 300;
const EXCLUDED_FIELDS = "-password_hash -__v";

const ALLOWED_UPDATE_FIELDS = [
    "name",
    "phone",
    "address",
];

// ============================================
// HELPERS
// ============================================
const escapeRegex = (str) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildCacheKey = (prefix, params) => {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`);
    return `${prefix}:${parts.join(":")}`;
};

const invalidateOwnerCache = async (ownerId = null) => {
    try {
        const promises = [delByPattern("store_owners:*")];
        if (ownerId) promises.push(del(`store_owner:${ownerId}`));
        await Promise.all(promises);
    } catch (err) {
        console.error("Owner cache invalidation error:", err);
    }
};

// ============================================
// 1. GET STORE OWNERS (Paginated)
// ============================================
export const getStoreOwners = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            verification_status,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = { is_deleted: { $ne: true } };

        if (status) filter.status = status;
        if (verification_status) {
            filter.verification_status = verification_status;
        }

        if (search) {
            const escaped = escapeRegex(search.trim());
            filter.$or = [
                { name: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
                { phone: { $regex: escaped, $options: "i" } },
            ];
        }

        const sortDir = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDir };

        const cacheKey = buildCacheKey("store_owners", {
            page: pageNum,
            limit: limitNum,
            status,
            verification_status,
            search,
            sort_by,
            sort_order,
        });

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Store owners fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const [owners, total] = await Promise.all([
            StoreOwner.find(filter)
                .select(EXCLUDED_FIELDS)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            StoreOwner.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);

        const responseData = {
            owners,
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
            message: "Store owners fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Store Owners Error:", err);
        return sendError(res, "Failed to fetch store owners");
    }
};

// ============================================
// 2. GET STORE OWNER BY ID
// ============================================
export const getStoreOwnerById = async (req, res) => {
    try {
        const { store_owner_id } = req.params;

        const cacheKey = `store_owner:${store_owner_id}`;
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Store owner fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const owner = await StoreOwner.findOne({
            _id: store_owner_id,
            is_deleted: { $ne: true },
        })
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!owner) {
            return sendError(
                res,
                "Store owner not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Fetch associated stores
        const stores = await Store.find({
            store_owner_id: store_owner_id,
            is_deleted: { $ne: true },
        })
            .select("store_name store_address store_is_active")
            .lean();

        const responseData = { ...owner, stores };

        await set(
            cacheKey,
            JSON.stringify(responseData),
            "EX",
            DETAIL_CACHE_TTL
        );

        return sendResponse({
            res,
            message: "Store owner fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Store Owner Error:", err);
        return sendError(res, "Failed to fetch store owner");
    }
};

// ============================================
// 3. UPDATE STORE OWNER
// ============================================
export const updateStoreOwner = async (req, res) => {
    try {
        const { store_owner_id } = req.params;

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

        updates.updated_by = req.user.auth_id;
        updates.updated_at = new Date();

        const owner = await StoreOwner.findOneAndUpdate(
            { _id: store_owner_id, is_deleted: { $ne: true } },
            { $set: updates },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!owner) {
            return sendError(
                res,
                "Store owner not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        await invalidateOwnerCache(store_owner_id);

        return sendResponse({
            res,
            message: "Store owner updated successfully",
            data: owner,
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(
                res,
                `${field} already exists`,
                STATUS_CODES.CONFLICT
            );
        }
        console.error("Update Store Owner Error:", err);
        return sendError(res, "Failed to update store owner");
    }
};

// ============================================
// 4. UPDATE STORE OWNER STATUS
// ============================================
export const updateStoreOwnerStatus = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const { status, reason } = req.body;
        const { auth_id } = req.user;

        const owner = await StoreOwner.findOne({
            _id: store_owner_id,
            is_deleted: { $ne: true },
        })
            .select("status name")
            .lean();

        if (!owner) {
            return sendError(
                res,
                "Store owner not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (owner.status === status) {
            return sendError(
                res,
                `Store owner is already ${status}`,
                STATUS_CODES.CONFLICT
            );
        }

        const updateData = {
            status,
            status_updated_by: auth_id,
            status_updated_at: new Date(),
        };

        if (status === ACCOUNT_STATUS.BLOCKED && reason) {
            updateData.block_reason = reason;
        }

        // If blocking owner, deactivate all their stores
        if (status === ACCOUNT_STATUS.BLOCKED) {
            await Store.updateMany(
                { store_owner_id, is_deleted: { $ne: true } },
                {
                    $set: {
                        store_is_active: false,
                        deactivation_reason: "Owner account blocked",
                    },
                }
            );
            await delByPattern("stores:*");
        }

        const updatedOwner = await StoreOwner.findByIdAndUpdate(
            store_owner_id,
            { $set: updateData },
            { new: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        await invalidateOwnerCache(store_owner_id);

        return sendResponse({
            res,
            message: `Store owner status updated to ${status}`,
            data: updatedOwner,
        });
    } catch (err) {
        console.error("Update Store Owner Status Error:", err);
        return sendError(res, "Failed to update store owner status");
    }
};

// ============================================
// 5. SOFT DELETE STORE OWNER
// ============================================
export const deleteStoreOwner = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const { auth_id } = req.user;

        const owner = await StoreOwner.findOne({
            _id: store_owner_id,
            is_deleted: { $ne: true },
        })
            .select("_id name")
            .lean();

        if (!owner) {
            return sendError(
                res,
                "Store owner not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Check for active stores
        const activeStores = await Store.countDocuments({
            store_owner_id,
            store_is_active: true,
            is_deleted: { $ne: true },
        });

        if (activeStores > 0) {
            return sendError(
                res,
                `Cannot delete owner with ${activeStores} active store(s). Deactivate stores first.`,
                STATUS_CODES.CONFLICT
            );
        }

        // Soft delete owner
        await StoreOwner.findByIdAndUpdate(store_owner_id, {
            $set: {
                is_deleted: true,
                status: ACCOUNT_STATUS.INACTIVE,
                deleted_by: auth_id,
                deleted_at: new Date(),
            },
        });

        // Soft delete all their stores
        await Store.updateMany(
            { store_owner_id, is_deleted: { $ne: true } },
            {
                $set: {
                    is_deleted: true,
                    store_is_active: false,
                    deleted_by: auth_id,
                    deleted_at: new Date(),
                },
            }
        );

        await Promise.all([
            invalidateOwnerCache(store_owner_id),
            delByPattern("stores:*"),
        ]);

        return sendResponse({
            res,
            message: "Store owner deleted successfully",
        });
    } catch (err) {
        console.error("Delete Store Owner Error:", err);
        return sendError(res, "Failed to delete store owner");
    }
};