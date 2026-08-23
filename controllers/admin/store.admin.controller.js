import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import StoreOwner from "../../models/StoreOwner.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { ACCOUNT_STATUS, STATUS_CODES, VERIFICATION_STATUS, BOOKING_STATUS } from "../../utils/constants.js";
import { escapeRegex, buildPagination } from "../../utils/helper.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import logger from "../../utils/logger.js";
import { cacheAside, deleteByPattern, deleteManyCache } from "../../constants/redis/redisOperation.js";
import { StoreKeys, StoreTTL } from "../../constants/redis/store.keys.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";
import { AuthKeys } from "../../constants/redis/auth.keys.js";
import { NS } from "../../constants/redis/namespaces.js";
import { invalidateStoreCache } from "../../constants/redis/invalidate/store.invalidate.js";

const EXCLUDED_FIELDS = "-password_hash -__v";
const MAX_BULK_SIZE = 50;

// CONFIRM: is the Booking schema field `storeId` (camelCase, per the booking admin
// controller fixed earlier) or `store_id` (snake_case, as used throughout this file)?
// Using the wrong one means this safety check silently never matches anything.
const STORE_BOOKING_FIELD = "storeId"; // ← change to "store_id" ONLY if confirmed that's correct

const STORE_BLOCKING_STATUSES = [
    BOOKING_STATUS.STORE_ASSIGNED, BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED, BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.STORED, BOOKING_STATUS.RETURN_REQUESTED,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
].filter(Boolean);

const hasBlockingBookings = async (storeIds) => {
    const count = await Booking.countDocuments({
        [STORE_BOOKING_FIELD]: { $in: storeIds },
        status: { $in: STORE_BLOCKING_STATUSES },
        isActive: true,
    });
    return count;
};

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

        if (store_owner_id) {
            const owner = await StoreOwner.findById(store_owner_id).select("_id account_status").lean();
            if (!owner) return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);
            if (owner.account_status !== ACCOUNT_STATUS.ACTIVE) {
                return sendError(res, "Cannot assign store to an inactive owner", STATUS_CODES.BAD_REQUEST);
            }
        }

        const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);

        let store;
        try {
            store = await Store.create({
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
        } catch (err) {
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern || {})[0] ?? "field";
                return sendError(res, `A store with this ${field} already exists`, STATUS_CODES.CONFLICT);
            }
            throw err;
        }

        await invalidateStoreCache(store._id, { storeOwnerId: store_owner_id });

        return sendResponse({ res, statusCode: STATUS_CODES.CREATED, message: "Store created successfully", data: { store } });
    } catch (err) {
        logger.error("[createStore] Error:", err);
        return sendError(res, "Failed to create store");
    }
};
// Relies on a unique index on `phone` in models/Store.js + the 11000 catch above —
// confirm that index exists (same pattern as Driver/StoreOwner).

// GET LIST
export const getStores = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, account_status, is_online, search,
            sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = AdminKeys.storeList({ page: pageNum, limit: limitNum, account_status, is_online, search, sort_by, sort_order });

        const responseData = await cacheAside(cacheKey, AdminTTL.STORE_LIST, async () => {
            const filter = {
                ...(account_status && { account_status }),
                ...(is_online !== undefined && { is_online: is_online === "true" || is_online === true }),
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

            return {
                stores,
                pagination: buildPagination(pageNum, limitNum, total),
            };
        });

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
        const store = await cacheAside(
            AdminKeys.storeDetail(store_id),
            AdminTTL.STORE_DETAIL,
            () => Store.findById(store_id).select(EXCLUDED_FIELDS).populate("store_owner_id", "first_name last_name email phone").lean()
        );
        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
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

        const updateFields = {
            updated_by: auth_id,
            ...(store_name && { store_name: store_name.trim() }),
            ...(max_booking_capacity && { max_booking_capacity }),
            ...(store_open_time && { store_open_time }),
            ...(store_close_time && { store_close_time }),
            ...(store_contact_number && { store_contact_number }),
            ...(store_description && { store_description: store_description.trim() }),
            ...(verification_status && Object.values(VERIFICATION_STATUS).includes(verification_status) && { verification_status }),
        };

        const updatedStore = await Store.findByIdAndUpdate(
            store_id, { $set: updateFields }, { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        if (!updatedStore) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);

        await invalidateStoreCache(store_id, { storeOwnerId: updatedStore.store_owner_id });

        return sendResponse({ res, message: "Store updated successfully", data: updatedStore });
    } catch (err) {
        logger.error("[updateStore] Error:", err);
        return sendError(res, "Failed to update store");
    }
};

// ONLINE / OFFLINE — this is exactly the kind of toggle a future driver/store-owner app would also call
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
            return sendError(res, "Cannot update store online/offline status because the store owner account is not active or verified.", STATUS_CODES.FORBIDDEN);
        }
        if (is_online) {
            if (store.account_status !== ACCOUNT_STATUS.ACTIVE) return sendError(res, "Cannot bring store online — account is not active", STATUS_CODES.FORBIDDEN);
            if (store.verification_status !== VERIFICATION_STATUS.VERIFIED) return sendError(res, "Cannot bring store online — store is not verified", STATUS_CODES.FORBIDDEN);
        }

        const updatedStore = await Store.findOneAndUpdate(
            { _id: store_id, is_online: store.is_online }, // atomic re-check, closes the same-shape race as everywhere else
            { $set: { is_online, status_updated_by: auth_id, status_updated_at: new Date() } },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        if (!updatedStore) return sendError(res, "Store status changed concurrently — please retry", STATUS_CODES.CONFLICT);

        await invalidateStoreCache(store_id, { storeOwnerId: store.store_owner_id });
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

        // fetch everything needed ONCE — no shadowed re-fetch
        const store = await Store.findById(store_id).select("account_status store_owner_id").lean();
        if (!store) return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);

        const isDeactivating = account_status && account_status !== ACCOUNT_STATUS.ACTIVE;

        if (isDeactivating) {
            const blockingCount = await hasBlockingBookings([store_id]);
            if (blockingCount > 0) {
                return sendError(res, `Cannot deactivate store — ${blockingCount} active booking(s) in progress`, STATUS_CODES.CONFLICT);
            }
        } else {
            const owner = await StoreOwner.findById(store.store_owner_id).select("account_status verification_status").lean();
            if (!owner || owner.account_status !== ACCOUNT_STATUS.ACTIVE || owner.verification_status !== VERIFICATION_STATUS.VERIFIED) {
                return sendError(res, "Cannot update store status because the store owner account is not active or verified.", STATUS_CODES.FORBIDDEN);
            }
        }

        const updateData = {
            updated_by: auth_id,
            ...(account_status !== undefined && { account_status }),
            ...(store_deactivated_reason !== undefined && { store_deactivated_reason }),
            ...(isDeactivating && { is_online: false, deactivated_at: new Date(), deactivated_by: auth_id }),
            ...(account_status === ACCOUNT_STATUS.ACTIVE && { store_deactivated_reason: null, deactivated_at: null, deactivated_by: null }),
        };

        const updatedStore = await Store.findByIdAndUpdate(store_id, { $set: updateData }, { new: true }).select(EXCLUDED_FIELDS).lean();

        const sideEffects = [invalidateStoreCache(store_id, { storeOwnerId: store.store_owner_id })];
        if (isDeactivating) {
            sideEffects.push(
                deleteByPattern(AuthKeys.refreshTokenPattern(NS.STORE, store_id)),
                deleteByPattern(AuthKeys.accessTokenPattern(NS.STORE, store_id)),
            );
        }
        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[toggleStoreStatus] side effect failed:", r.reason?.message));
        // clearAuthCookies(res) REMOVED — was clearing the ADMIN's own session, not the store's.

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
        if (ids.length > MAX_BULK_SIZE) {
            return sendError(res, `Cannot process more than ${MAX_BULK_SIZE} accounts at once`, STATUS_CODES.BAD_REQUEST);
        }

        const uniqueIds = [...new Set(ids.map(String))];
        const activeStores = await Store.find({ _id: { $in: uniqueIds }, account_status: ACCOUNT_STATUS.ACTIVE }).select("_id store_owner_id").lean();
        if (activeStores.length === 0) {
            return sendError(res, "No active stores found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        const activeIds = activeStores.map((s) => s._id);
        const blockingCount = await hasBlockingBookings(activeIds);
        if (blockingCount > 0) {
            return sendError(res, `Cannot deactivate — ${blockingCount} active booking(s) in progress across selected stores`, STATUS_CODES.CONFLICT);
        }

        const result = await Store.updateMany(
            { _id: { $in: activeIds } },
            { $set: { is_online: false, account_status: ACCOUNT_STATUS.INACTIVE, store_deactivated_reason: reason ?? "Admin bulk deactivation", deactivated_at: new Date(), deactivated_by: auth_id, status_updated_by: auth_id, status_updated_at: new Date() } }
        );

        const ownerIds = [...new Set(activeStores.map((s) => s.store_owner_id).filter(Boolean).map(String))];
        const sideEffects = [
            ...activeIds.map((id) => invalidateStoreCache(id)),
            ...ownerIds.map((id) => deleteByPattern(AuthKeys.refreshTokenPattern(NS.STORE, id))), // NOTE: this revokes owner sessions by owner id — see caveat below
            ...activeIds.map((id) => deleteByPattern(AuthKeys.refreshTokenPattern(NS.STORE, id))),
            ...activeIds.map((id) => deleteByPattern(AuthKeys.accessTokenPattern(NS.STORE, id))),
        ];
        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[bulkDeactivateStores] side effect failed:", r.reason?.message));

        return sendResponse({
            res,
            message: `${result.modifiedCount} store(s) deactivated successfully`,
            data: { requested: uniqueIds.length, deactivated: result.modifiedCount, alreadyInactive: uniqueIds.length - activeStores.length },
        });
    } catch (err) {
        logger.error("[bulkDeactivateStores] Error:", err);
        return sendError(res, "Failed to deactivate stores");
    }
};

// UPDATE LOCATION — the clearest "future driver-app" candidate: a driver dropping off
// at a NEW store location, or a store-owner-portal endpoint, could call this same logic.
export const updateStoreCurrentLocation = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { lat, lng, address } = req.body;
        const { auth_id } = req.user;

        const latitude = Number(lat);
        const longitude = Number(lng);
        if (isNaN(latitude) || isNaN(longitude)) return sendError(res, "Latitude and longitude are required", STATUS_CODES.BAD_REQUEST);
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return sendError(res, "Invalid latitude or longitude", STATUS_CODES.BAD_REQUEST);

        const store = await Store.findById(store_id).select("_id account_status store_owner_id").lean();
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

        await invalidateStoreCache(store_id, { storeOwnerId: store.store_owner_id });
        return sendResponse({ res, message: "Store location updated successfully", data: updatedStore });
    } catch (err) {
        logger.error("[updateStoreCurrentLocation] Error:", err);
        return sendError(res, "Failed to update store location");
    }
};