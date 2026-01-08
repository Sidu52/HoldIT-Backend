import mongoose from "mongoose";
import Store from "../../models/Store.js";
import StoreOwner from "../../models/StoreOwner.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";
import { updateStoreOwnerSchema, updateStoreSchema } from "../../validations/store_owner.validation.js";

export const getStores = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
    } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status) filter.status = status;
    if (search) filter.$or = [{ store_name: { $regex: search, $options: "i" } }, { store_address: { $regex: search, $options: "i" } }];

    const cacheKey = `stores:${pageNum}:${limitNum}:${status|| "all"}:${search || "all"}`;

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
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Store.countDocuments(filter),
    ]);

    const responseData = {
      stores,
      pagination: { 
        currentPage: Number(page),
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: Number(limitNum), 
        },
    };

    await set(cacheKey, JSON.stringify(responseData), "EX", 120);

    sendResponse({
      res,
      message: "Stores fetched successfully",
      data: responseData,
    });
  } catch (err) {
    console.error("Get Stores Error:", err);
    sendError(res, "Failed to fetch stores");
  }
};

export const getStoreById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid store ID", 400);
    }

    const cacheKey = `store:${id}`;
    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Store fetched successfully",
        data: JSON.parse(cached),
      });
    }

    const store = await Store.findById(id).lean().populate("store_owner_id");
    if (!store) {
      return sendError(res, "Store not found", 404);
    }

    await set(cacheKey, JSON.stringify(store), "EX", 120);

    sendResponse({
      res,
      message: "Store fetched successfully",
      data: store,
    });
  } catch (err) {
    console.error("Get Store Error:", err);
    sendError(res, "Failed to fetch store");
  }
};

export const updateStore = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid store ID", 400);
    }

    const { error, value } = updateStoreSchema.validate(req.body);
    if (error) {
      return sendError(res, error.details[0].message, 400);
    }

    const {
      store_name,
      store_address,
      store_capacity,
      store_open_time,
      store_close_time,
      store_description,
      lat,
      lng,
    } = value;

    const updates = {
      store_name,
      store_address,
      store_capacity,
      store_open_time,
      store_close_time,
      store_description,
      location: {
        type: "Point",
        coordinates: [lng, lat],
        address: store_address,
      },
    };

    const store = await Store.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!store) {
      return sendError(res, "Store not found", 404);
    }

    await Promise.all([
      set(`store:${id}`, "", "EX", 1),
      set("stores:*", "", "EX", 1),
    ]);

    sendResponse({
      res,
      message: "Store updated successfully",
      data: store,
    });
  } catch (err) {
    console.error("Update Store Error:", err);
    sendError(res, "Failed to update store");
  }
};

export const deleteStore = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid store ID", 400);
    }

    const store = await Store.findByIdAndDelete(id);
    if (!store) {
      return sendError(res, "Store not found", 404);
    }

    await Promise.all([
      set(`store:${id}`, "", "EX", 1),
      set("stores:*", "", "EX", 1),
    ]);

    sendResponse({
      res,
      message: "Store deleted successfully",
    });
  } catch (err) {
    console.error("Delete Store Error:", err);
    sendError(res, "Failed to delete store");
  }
};


// Store Owner
export const getStoreOwners = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (search) {
      filter.name = { $regex: search, $options: "i" }; // case-insensitive search
    }

    const cacheKey = `storeOwners:${pageNum}:${limitNum}:${search || "all"}`;

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
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StoreOwner.countDocuments(filter),
    ]);

    const responseData = {
      owners,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: Number(limitNum),
        },
    };

    await set(cacheKey, JSON.stringify(responseData), "EX", 120);

    sendResponse({
      res,
      message: "Store owners fetched successfully",
      data: responseData,
    });
  } catch (err) {
    console.error("Get Store Owners Error:", err);
    sendError(res, "Failed to fetch store owners");
  }
};

export const getStoreOwnerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid store owner ID", 400);
    }

    const cacheKey = `storeOwner:${id}`;
    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Store owner fetched successfully",
        data: JSON.parse(cached),
      });
    }

    const owner = await StoreOwner.findById(id).lean();
    if (!owner) {
      return sendError(res, "Store owner not found", 404);
    }

    await set(cacheKey, JSON.stringify(owner), "EX", 120);

    sendResponse({
      res,
      message: "Store owner fetched successfully",
      data: owner,
    });
  } catch (err) {
    console.error("Get Store Owner Error:", err);
    sendError(res, "Failed to fetch store owner");
  }
};

export const createStoreOwner = async (req, res) => {
  try {
    const { error, value } = updateStoreOwnerSchema.validate(req.body);
    if (error) {
      return sendError(res, error.details[0].message, 400);
    }

    const owner = await StoreOwner.create(value);

    // Invalidate owner cache
    await set("storeOwners:*", "", "EX", 1);

    sendResponse({
      res,
      message: "Store owner created successfully",
      data: owner,
    });
  } catch (err) {
    console.error("Create Store Owner Error:", err);
    sendError(res, "Failed to create store owner");
  }
};


export const updateStoreOwner = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid store owner ID", 400);
    }

    const { error, value } = updateStoreOwnerSchema.validate(req.body);
    if (error) {
      return sendError(res, error.details[0].message, 400);
    }

    const owner = await StoreOwner.findByIdAndUpdate(
      id,
      { $set: value },
      { new: true, runValidators: true }
    );

    if (!owner) {
      return sendError(res, "Store owner not found", 404);
    }

    await Promise.all([
      set(`storeOwner:${id}`, "", "EX", 1),
      set("storeOwners:*", "", "EX", 1),
    ]);

    sendResponse({
      res,
      message: "Store owner updated successfully",
      data: owner,
    });
  } catch (err) {
    console.error("Update Store Owner Error:", err);
    sendError(res, "Failed to update store owner");
  }
};

export const deleteStoreOwner = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid store owner ID", 400);
    }

    const owner = await StoreOwner.findByIdAndDelete(id);
    if (!owner) {
      return sendError(res, "Store owner not found", 404);
    }

    await Promise.all([
      set(`storeOwner:${id}`, "", "EX", 1),
      set("storeOwners:*", "", "EX", 1),
    ]);

    sendResponse({
      res,
      message: "Store owner deleted successfully",
    });
  } catch (err) {
    console.error("Delete Store Owner Error:", err);
    sendError(res, "Failed to delete store owner");
  }
};


