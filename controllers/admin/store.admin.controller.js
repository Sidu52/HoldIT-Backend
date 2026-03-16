// controllers/admin/store.admin.controller.js

import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES } from "../../utils/constants.js";

// ============================================
// CONSTANTS
// ============================================
const LIST_CACHE_TTL = 120;
const DETAIL_CACHE_TTL = 300;
const EXCLUDED_FIELDS = "-__v";

const ALLOWED_UPDATE_FIELDS = [
  "store_name",
  "store_address",
  "store_capacity",
  "store_open_time",
  "store_close_time",
  "store_description",
  "lat",
  "lng",
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

const invalidateStoreCache = async (storeId = null) => {
  try {
    const promises = [delByPattern("stores:*")];
    if (storeId) promises.push(del(`store:${storeId}`));
    await Promise.all(promises);
  } catch (err) {
    console.error("Store cache invalidation error:", err);
  }
};

// ============================================
// 1. GET STORES (Paginated)
// ============================================
export const getStores = async (req, res) => {
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

    const filter = { is_deleted: { $ne: true } };

    if (status) filter.status = status;
    if (is_active !== undefined) filter.store_is_active = is_active;

    if (search) {
      const escaped = escapeRegex(search.trim());
      filter.$or = [
        { store_name: { $regex: escaped, $options: "i" } },
        { store_address: { $regex: escaped, $options: "i" } },
      ];
    }

    const sortDir = sort_order === "asc" ? 1 : -1;
    const sort = { [sort_by]: sortDir };

    const cacheKey = buildCacheKey("stores", {
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
        message: "Stores fetched successfully",
        data: JSON.parse(cached),
      });
    }

    const [stores, total] = await Promise.all([
      Store.find(filter)
        .select(EXCLUDED_FIELDS)
        .populate("store_owner_id", "name email phone")
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Store.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    const responseData = {
      stores,
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
      message: "Stores fetched successfully",
      data: responseData,
    });
  } catch (err) {
    console.error("Get Stores Error:", err);
    return sendError(res, "Failed to fetch stores");
  }
};

// ============================================
// 2. GET STORE BY ID
// ============================================
export const getStoreById = async (req, res) => {
  try {
    const { store_id } = req.params;

    const cacheKey = `store:${store_id}`;
    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Store fetched successfully",
        data: JSON.parse(cached),
      });
    }

    const store = await Store.findOne({
      _id: store_id,
      is_deleted: { $ne: true },
    })
      .select(EXCLUDED_FIELDS)
      .populate("store_owner_id", "name email phone")
      .lean();

    if (!store) {
      return sendError(
        res,
        "Store not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    await set(cacheKey, JSON.stringify(store), "EX", DETAIL_CACHE_TTL);

    return sendResponse({
      res,
      message: "Store fetched successfully",
      data: store,
    });
  } catch (err) {
    console.error("Get Store By ID Error:", err);
    return sendError(res, "Failed to fetch store");
  }
};

// ============================================
// 3. UPDATE STORE
// ============================================
export const updateStore = async (req, res) => {
  try {
    const { store_id } = req.params;

    const updates = {};
    ALLOWED_UPDATE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Build location if lat/lng provided
    if (updates.lat !== undefined && updates.lng !== undefined) {
      updates.location = {
        type: "Point",
        coordinates: [updates.lng, updates.lat],
        address: updates.store_address || undefined,
      };
      delete updates.lat;
      delete updates.lng;
    } else if (
      updates.lat !== undefined ||
      updates.lng !== undefined
    ) {
      return sendError(
        res,
        "Both lat and lng are required to update location",
        STATUS_CODES.BAD_REQUEST
      );
    }

    if (Object.keys(updates).length === 0) {
      return sendError(
        res,
        "No valid fields to update",
        STATUS_CODES.BAD_REQUEST
      );
    }

    updates.updated_by = req.user.auth_id;
    updates.updated_at = new Date();

    const store = await Store.findOneAndUpdate(
      { _id: store_id, is_deleted: { $ne: true } },
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select(EXCLUDED_FIELDS)
      .lean();

    if (!store) {
      return sendError(
        res,
        "Store not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    await invalidateStoreCache(store_id);

    return sendResponse({
      res,
      message: "Store updated successfully",
      data: store,
    });
  } catch (err) {
    console.error("Update Store Error:", err);
    return sendError(res, "Failed to update store");
  }
};

// ============================================
// 4. TOGGLE STORE STATUS
// ============================================
export const toggleStoreStatus = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { is_active, reason } = req.body;
    const { auth_id } = req.user;

    const store = await Store.findOne({
      _id: store_id,
      is_deleted: { $ne: true },
    })
      .select("store_is_active store_name")
      .lean();

    if (!store) {
      return sendError(
        res,
        "Store not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    if (store.store_is_active === is_active) {
      return sendError(
        res,
        `Store is already ${is_active ? "active" : "inactive"}`,
        STATUS_CODES.CONFLICT
      );
    }

    const updateData = {
      store_is_active: is_active,
      status_updated_by: auth_id,
      status_updated_at: new Date(),
    };

    if (!is_active && reason) {
      updateData.deactivation_reason = reason;
    }

    if (is_active) {
      updateData.deactivation_reason = null;
    }

    const updatedStore = await Store.findByIdAndUpdate(
      store_id,
      { $set: updateData },
      { new: true }
    )
      .select(EXCLUDED_FIELDS)
      .lean();

    await invalidateStoreCache(store_id);

    return sendResponse({
      res,
      message: `Store ${is_active ? "activated" : "deactivated"} successfully`,
      data: updatedStore,
    });
  } catch (err) {
    console.error("Toggle Store Status Error:", err);
    return sendError(res, "Failed to update store status");
  }
};

// ============================================
// 5. SOFT DELETE STORE
// ============================================
export const deleteStore = async (req, res) => {
  try {
    const { store_id } = req.params;
    const { auth_id } = req.user;

    const store = await Store.findOne({
      _id: store_id,
      is_deleted: { $ne: true },
    })
      .select("_id store_name")
      .lean();

    if (!store) {
      return sendError(
        res,
        "Store not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    await Store.findByIdAndUpdate(store_id, {
      $set: {
        is_deleted: true,
        store_is_active: false,
        deleted_by: auth_id,
        deleted_at: new Date(),
      },
    });

    await invalidateStoreCache(store_id);

    return sendResponse({
      res,
      message: "Store deleted successfully",
    });
  } catch (err) {
    console.error("Delete Store Error:", err);
    return sendError(res, "Failed to delete store");
  }
};