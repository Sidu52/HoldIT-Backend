import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import StoreOwner from "../../models/StoreOwner.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { clearAuthCookies } from "../../utils/token.js";
import { getCache, setCache, deleteCache, deleteManyCache, deleteByPattern, buildCacheKey } from "../../utils/cache.js";
import { ACCOUNT_STATUS, STATUS_CODES, VERIFICATION_STATUS, BOOKING_STATUS, CACHE_TTL } from "../../utils/constants.js";
import { escapeRegex } from "../../utils/helper.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import logger from "../../utils/logger.js";

const EXCLUDED_FIELDS = "-password_hash -__v";

// Key Builders
const storeKey = (id) => buildCacheKey("store", { id: String(id) });
const storeListPattern = "stores:*";

const STORE_BLOCKING_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED, BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED, BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.STORED, BOOKING_STATUS.RETURN_REQUESTED,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
].filter(Boolean);

// CREATE
export const createStore = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const {
            store_owner_id, store_name, store_description,
            store_open_time, store_close_time, store_contact_number,
            max_booking_capacity, location, phone,
        } = req.body;
        const { lat, lng, address } = location;

        const existing = await Store.findOne({ phone }).select("_id").lean();
        if (existing) return sendError(res, "A store with this phone number already exists", STATUS_CODES.CONFLICT);

        if (store_owner_id) {
            const owner = await StoreOwner.findById(store_owner_id).select("_id account_status").lean();
            if (!owner) return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);
            if (owner.account_status !== ACCOUNT_STATUS.ACTIVE) {
                return sendError(res, "Cannot assign store to an inactive owner", STATUS_CODES.BAD_REQUEST);
            }
        }

        const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);

        const store = await Store.create({
            phone,
            store_name: store_name.trim(),
            store_description: store_description?.trim() ?? "",
            store_open_time: store_open_time ?? null,
            store_close_time: store_close_time ?? null,
            store_contact_number: store_contact_number ?? null,
            max_booking_capacity: max_booking_capacity ?? 50,
            location: { type: "Point", coordinates: [lng, lat], address: address.trim() },
            service_area_id: isServiceable ? serviceAreaId : null,
            is_serviceable: isServiceable,
            store_owner_id: store_owner_id ?? null,
            account_status: ACCOUNT_STATUS.PENDING,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            is_online: false,
            updated_by: auth_id,
        });

        await Promise.all([
            deleteByPattern(storeListPattern),
            store_owner_id && deleteByPattern(`store_owners:*`),
        ].filter(Boolean));

        return sendResponse({ res, statusCode: STATUS_CODES.CREATED, message: "Store created successfully", data: { store } });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(res, `A store with this ${field} already exists`, STATUS_CODES.CONFLICT);
        }
        logger.error("[createStore] Error:", err);
        return sendError(res, "Failed to create store");
    }
};

// GET LIST
export const getStores = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, account_status, is_online, search,
            sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = buildCacheKey("stores", {
            page: pageNum, limit: limitNum,
            account_status, is_online, search: search || "none", sort_by, sort_order,
        });

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Stores fetched successfully", data: cached });

        const filter = {
            ...(account_status && { account_status }),
            ...(is_online !== undefined && { is_online }),
        };

        if (search) {
            const r = { $regex: escapeRegex(search.trim()), $options: "i" };
            filter.$or = [{ store_name: r }, { store_contact_number: r }];
        }

        const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
        const skip = (pageNum - 1) * limitNum;

        const [stores, total] = await Promise.all([
            Store.find(filter).select(EXCLUDED_FIELDS)
                .populate("store_owner_id", "first_name last_name email phone")
                .sort(sort).skip(skip).limit(limitNum).lean(),
            Store.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            stores,
            pagination: {
                currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
            },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.LIST);
        return sendResponse({ res, message: "Stores fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getStores] Error:", err);
        return sendError(res, "Failed to fetch stores");
    }
};

// GET BY ID
export const getStoreById = async (req, res) => {
    try {
        const { store_id } = req.params;
        const cacheKey = storeKey(store_id);

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Store fetched successfully", data: cached });

        const store = await Store.findById(store_id)
            .select(EXCLUDED_FIELDS)
            .populate("store_owner_id", "first_name last_name email phone")
            .lean();

        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);

        await setCache(cacheKey, store, CACHE_TTL.DETAIL);
        return sendResponse({ res, message: "Store fetched successfully", data: store });
    } catch (err) {
        logger.error("[getStoreById] Error:", err);
        return sendError(res, "Failed to fetch store");
    }
};

// UPDATE
export const updateStore = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { auth_id } = req.user;
        const { store_name, max_booking_capacity, store_open_time, store_close_time, store_contact_number, store_description, verification_status } = req.body;

        const store = await Store.findById(store_id).select("_id store_owner_id").lean();
        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);

        const updateFields = {
            updated_by: auth_id,
            ...(store_name && { store_name: store_name.trim() }),
            ...(max_booking_capacity && { max_booking_capacity }),
            ...(store_open_time && { store_open_time }),
            ...(store_close_time && { store_close_time }),
            ...(store_contact_number && { store_contact_number }),
            ...(store_description && { store_description: store_description.trim() }),
            ...(verification_status && { verification_status }),
        };

        const updatedStore = await Store.findByIdAndUpdate(
            store_id, { $set: updateFields }, { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        await Promise.all([
            deleteCache(storeKey(store_id)),
            deleteByPattern(storeListPattern),
            store.store_owner_id && deleteByPattern(`store_owners:*`),
        ].filter(Boolean));

        return sendResponse({ res, message: "Store updated successfully", data: updatedStore });
    } catch (err) {
        logger.error("[updateStore] Error:", err);
        return sendError(res, "Failed to update store");
    }
};

// ONLINE / OFFLINE
export const updateStoreOnline = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { auth_id } = req.user;
        const { is_online } = req.body;

        const store = await Store.findById(store_id)
            .select("is_online account_status verification_status store_owner_id")
            .lean();
        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        if (store.is_online === is_online) return sendError(res, `Store is already ${is_online ? "online" : "offline"}`, STATUS_CODES.CONFLICT);

        const owner = await StoreOwner.findById(store.store_owner_id).select("account_status verification_status").lean();
        if (!owner || owner.account_status !== ACCOUNT_STATUS.ACTIVE || owner.verification_status !== VERIFICATION_STATUS.VERIFIED) {
            return sendError(
                res,
                "Cannot update store online/offline status because the store owner account is not active or verified.",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (is_online) {
            if (store.account_status !== ACCOUNT_STATUS.ACTIVE) return sendError(res, "Cannot bring store online — account is not active", STATUS_CODES.FORBIDDEN);
            if (store.verification_status !== VERIFICATION_STATUS.VERIFIED) return sendError(res, "Cannot bring store online — store is not verified", STATUS_CODES.FORBIDDEN);
        }

        const updatedStore = await Store.findByIdAndUpdate(
            store_id,
            { $set: { is_online, status_updated_by: auth_id, status_updated_at: new Date() } },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        await Promise.all([deleteCache(storeKey(store_id)), deleteByPattern(storeListPattern)]);
        return sendResponse({ res, message: `Store is now ${is_online ? "online" : "offline"}`, data: updatedStore });
    } catch (err) {
        logger.error("[updateStoreOnline] Error:", err);
        return sendError(res, "Failed to update store online/offline");
    }
};

// TOGGLE STATUS
export const toggleStoreStatus = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { account_status, store_deactivated_reason } = req.body;
        const { auth_id } = req.user;

        const store = await Store.findById(store_id).select("account_status").lean();
        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);

        const isDeactivating = account_status && account_status !== ACCOUNT_STATUS.ACTIVE;

        if (isDeactivating) {
            const activeBookingCount = await Booking.countDocuments({
                store_id, status: { $in: STORE_BLOCKING_STATUSES }, isActive: true,
            });
            if (activeBookingCount > 0) {
                return sendError(res, `Cannot deactivate store — ${activeBookingCount} active booking(s) in progress`, STATUS_CODES.CONFLICT);
            }
        } else {
            const store = await Store.findById(store_id).select("store_owner_id").lean();
            if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);

            const owner = await StoreOwner.findById(store.store_owner_id).select("account_status verification_status").lean();
            if (!owner || owner.account_status !== ACCOUNT_STATUS.ACTIVE || owner.verification_status !== VERIFICATION_STATUS.VERIFIED) {
                return sendError(
                    res,
                    "Cannot update store status because the store owner account is not active or verified.",
                    STATUS_CODES.FORBIDDEN
                );
            }
        }

        const updateData = {
            updated_by: auth_id,
            ...(account_status !== undefined && { account_status }),
            ...(store_deactivated_reason !== undefined && { store_deactivated_reason }),
            ...(isDeactivating && { is_online: false, deactivated_at: new Date(), deactivated_by: auth_id }),
            ...(account_status === ACCOUNT_STATUS.ACTIVE && { store_deactivated_reason: null, deactivated_at: null, deactivated_by: null }),
        };

        const updatedStore = await Store.findByIdAndUpdate(
            store_id, { $set: updateData }, { new: true }
        ).select(EXCLUDED_FIELDS).lean();

        if (isDeactivating) {
            await Promise.all([
                deleteByPattern(`refresh:${store_id}:*`),
                deleteByPattern(`access:${store_id}:*`),
            ]);
            clearAuthCookies(res);
        }

        await Promise.all([deleteCache(storeKey(store_id)), deleteByPattern(storeListPattern)]);
        return sendResponse({ res, message: `Store ${isDeactivating ? "deactivated" : "updated"} successfully`, data: updatedStore });
    } catch (err) {
        logger.error("[toggleStoreStatus] Error:", err);
        return sendError(res, "Failed to update store status");
    }
};

// BULK DEACTIVATE
export const bulkDeactivateStores = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const { auth_id } = req.user;

        if (!Array.isArray(ids) || ids.length === 0) {
            return sendError(res, "No store IDs provided", STATUS_CODES.BAD_REQUEST);
        }

        const activeStores = await Store.find({ _id: { $in: ids }, account_status: ACCOUNT_STATUS.ACTIVE }).select("_id").lean();
        if (activeStores.length === 0) {
            return sendError(res, "No active stores found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        const activeIds = activeStores.map((s) => s._id);

        const activeBookingCount = await Booking.countDocuments({
            store_id: { $in: activeIds }, status: { $in: STORE_BLOCKING_STATUSES }, isActive: true,
        });
        if (activeBookingCount > 0) {
            return sendError(res, `Cannot deactivate — ${activeBookingCount} active booking(s) in progress across selected stores`, STATUS_CODES.CONFLICT);
        }

        const result = await Store.updateMany(
            { _id: { $in: activeIds } },
            { $set: { is_online: false, account_status: ACCOUNT_STATUS.INACTIVE, store_deactivated_reason: reason ?? "Admin bulk deactivation", deactivated_at: new Date(), deactivated_by: auth_id, status_updated_by: auth_id, status_updated_at: new Date() } }
        );

        await Promise.all([
            ...activeIds.map((storeId) => Promise.all([
                deleteByPattern(`refresh:${storeId}:*`),
                deleteByPattern(`access:${storeId}:*`),
            ])),
            deleteManyCache(activeIds.map((id) => storeKey(id))),
            deleteByPattern(storeListPattern),
        ]);

        if (result.modifiedCount > 0) {
            clearAuthCookies(res);
        }

        return sendResponse({
            res,
            message: `${result.modifiedCount} store(s) deactivated successfully`,
            data: { requested: ids.length, deactivated: result.modifiedCount, alreadyInactive: ids.length - activeStores.length },
        });
    } catch (err) {
        logger.error("[bulkDeactivateStores] Error:", err);
        return sendError(res, "Failed to deactivate stores");
    }
};

// UPDATE LOCATION
export const updateStoreCurrentLocation = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { lat, lng, address } = req.body;
        const { auth_id } = req.user;

        const latitude = Number(lat);
        const longitude = Number(lng);

        if (isNaN(latitude) || isNaN(longitude)) return sendError(res, "Latitude and longitude are required", STATUS_CODES.BAD_REQUEST);
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return sendError(res, "Invalid latitude or longitude", STATUS_CODES.BAD_REQUEST);

        const store = await Store.findById(store_id).select("_id account_status").lean();
        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        if (store.account_status !== ACCOUNT_STATUS.ACTIVE) return sendError(res, "Store account is not active", STATUS_CODES.FORBIDDEN);

        const { isServiceable: is_serviceable, serviceAreaId } = await checkServiceability(longitude, latitude);

        const updatedStore = await Store.findByIdAndUpdate(store_id, {
            $set: {
                location: { type: "Point", coordinates: [longitude, latitude], address: address?.trim() ?? "" },
                is_serviceable, service_area_id: is_serviceable ? serviceAreaId : null,
                updated_by: auth_id,
            },
        }, { new: true, runValidators: true }).select(EXCLUDED_FIELDS).lean();

        await Promise.all([deleteCache(storeKey(store_id)), deleteByPattern(storeListPattern)]);
        return sendResponse({ res, message: "Store location updated successfully", data: updatedStore });
    } catch (err) {
        logger.error("[updateStoreCurrentLocation] Error:", err);
        return sendError(res, "Failed to update store location");
    }
};