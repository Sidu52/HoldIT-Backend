import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import StoreOwner from "../../models/StoreOwner.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import {
    ACCOUNT_STATUS,
    STATUS_CODES,
    VERIFICATION_STATUS,
    BOOKING_STATUS,
} from "../../utils/constants.js";
import { checkServiceability } from "../../utils/serviceable.js";

const LIST_CACHE_TTL = 120;
const DETAIL_CACHE_TTL = 300;
const EXCLUDED_FIELDS = "-__v";

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


export const createStore = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const {
            store_name,
            store_description,
            store_open_time,
            store_close_time,
            store_contact_number,
            max_booking_capacity,
            lat,
            lng,
            address,
            phone,
            store_owner_id,
        } = req.body;

        // Check phone uniqueness
        const existingStore = await Store.findOne({ phone })
            .select("_id")
            .lean();

        if (existingStore) {
            return sendError(
                res,
                "A store with this phone number already exists",
                STATUS_CODES.CONFLICT
            );
        }

        // Validate store owner if provided
        if (store_owner_id) {
            const owner = await StoreOwner.findById(store_owner_id)
                .select("_id is_active")
                .lean();

            if (!owner) {
                return sendError(
                    res,
                    "Store owner not found",
                    STATUS_CODES.NOT_FOUND
                );
            }

            if (!owner.is_active) {
                return sendError(
                    res,
                    "Cannot assign store to an inactive owner",
                    STATUS_CODES.BAD_REQUEST
                );
            }
        }

        // Check serviceability
        const { isServiceable, serviceAreaId } = await checkServiceability(lat, lng);
        if (!isServiceable) {
            return sendError(
                res,
                "Store location is not within any active service area",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const store = await Store.create({
            phone,
            store_name: store_name.trim(),
            store_description: store_description?.trim() ?? "",
            store_open_time: store_open_time ?? null,
            store_close_time: store_close_time ?? null,
            store_contact_number: store_contact_number ?? null,
            max_booking_capacity: max_booking_capacity ?? 50,
            location: {
                type: "Point",
                coordinates: [lng, lat],
                address: address.trim(),
            },
            service_area_id: serviceAreaId,
            store_owner_id: store_owner_id ?? null,
            status: ACCOUNT_STATUS.PENDING,
            verification_status: VERIFICATION_STATUS.UNDER_REVIEW,
            is_active: true,
            is_online: false,
            is_verified: false,
            is_signup: true,
            updated_by: auth_id,
        });

        await invalidateStoreCache();

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Store created successfully",
            data: { store },
        });
    } catch (err) {
        // Handle MongoDB duplicate key (race condition on phone)
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(
                res,
                `A store with this ${field} already exists`,
                STATUS_CODES.CONFLICT
            );
        }

        console.error("[createStore] Error:", err);
        return sendError(res, "Failed to create store");
    }
};


// ── GET STORES ────────────────────────────────────────────────────
export const getStores = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            is_active,
            is_online,
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
        if (verification_status) filter.verification_status = verification_status;
        if (is_active !== undefined) filter.is_active = is_active === "true";
        if (is_online !== undefined) filter.is_online = is_online === "true";

        if (search) {
            const escaped = escapeRegex(search.trim());
            filter.$or = [
                { store_name: { $regex: escaped, $options: "i" } },
                { store_contact_number: { $regex: escaped, $options: "i" } },
            ];
        }

        const sortDir = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDir };

        const cacheKey = buildCacheKey("stores", {
            page: pageNum, limit: limitNum, status,
            is_active, is_online, verification_status,
            search, sort_by, sort_order,
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
                // ✅ Fixed: StoreOwner has first_name/last_name not "name"
                .populate("store_owner_id", "first_name last_name email phone")
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
        console.error("[getStores] Error:", err);
        return sendError(res, "Failed to fetch stores");
    }
};

// ── GET STORE BY ID ───────────────────────────────────────────────
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
            // ✅ Fixed: first_name/last_name not "name"
            .populate("store_owner_id", "first_name last_name email phone")
            .lean();

        if (!store) {
            return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        }

        await set(cacheKey, JSON.stringify(store), "EX", DETAIL_CACHE_TTL);

        return sendResponse({
            res,
            message: "Store fetched successfully",
            data: store,
        });
    } catch (err) {
        console.error("[getStoreById] Error:", err);
        return sendError(res, "Failed to fetch store");
    }
};

// ── UPDATE STORE ──────────────────────────────────────────────────
export const updateStore = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { auth_id } = req.user;
        const {
            store_name,
            max_booking_capacity,
            store_open_time,
            store_close_time,
            store_contact_number,
            store_description,
            lat,
            lng,
            address,
        } = req.body;

        const store = await Store.findOne({
            _id: store_id,
            is_deleted: { $ne: true },
        })
            .select("_id store_name")
            .lean();

        if (!store) {
            return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        }

        const updateFields = {
            updated_at: new Date(),
            updated_by: auth_id,
            ...(store_name           && { store_name }),
            ...(max_booking_capacity && { max_booking_capacity }),
            ...(store_open_time      && { store_open_time }),
            ...(store_close_time     && { store_close_time }),
            ...(store_contact_number && { store_contact_number }),
            ...(store_description    && { store_description }),
        };

        if (lat != null && lng != null) {
            updateFields.location = {
                type: "Point",
                coordinates: [lng, lat],
                address: address ?? "",
            };
        }

        const updatedStore = await Store.findByIdAndUpdate(
            store_id,
            { $set: updateFields },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        await invalidateStoreCache(store_id);

        return sendResponse({
            res,
            message: "Store updated successfully",
            data: updatedStore,
        });
    } catch (err) {
        console.error("[updateStore] Error:", err);
        return sendError(res, "Failed to update store");
    }
};

// ── UPDATE STORE ONLINE/OFFLINE ───────────────────────────────────
export const updateStoreOnline = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { auth_id } = req.user;
        const { is_online } = req.body;

        const store = await Store.findOne({
            _id: store_id,
            is_deleted: { $ne: true },
        })
            .select("is_online is_active status verification_status")
            .lean();

        if (!store) {
            return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        }

        // Guard: can only go online if account is valid
        if (is_online && !store.is_active) {
            return sendError(
                res,
                "Cannot bring store online — store is deactivated",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (is_online && store.verification_status !== VERIFICATION_STATUS.VERIFIED) {
            return sendError(
                res,
                "Cannot bring store online — store is not verified",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (store.is_online === is_online) {
            return sendError(
                res,
                `Store is already ${is_online ? "online" : "offline"}`,
                STATUS_CODES.CONFLICT
            );
        }

        const updatedStore = await Store.findByIdAndUpdate(
            store_id,
            {
                $set: {
                    is_online,
                    status_updated_by: auth_id,
                    status_updated_at: new Date(),
                },
            },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        await invalidateStoreCache(store_id);

        return sendResponse({
            res,
            message: `Store is now ${is_online ? "online" : "offline"}`,
            data: updatedStore,
        });
    } catch (err) {
        console.error("[updateStoreOnline] Error:", err);
        return sendError(res, "Failed to update store online/offline");
    }
};

// ── TOGGLE STORE STATUS ───────────────────────────────────────────
export const toggleStoreStatus = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { is_active, reason } = req.body;
        const { auth_id } = req.user;

        const store = await Store.findOne({
            _id: store_id,
            is_deleted: { $ne: true },
        })
            .select("is_active is_online store_name")
            .lean();

        if (!store) {
            return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        }

        if (store.is_active === is_active) {
            return sendError(
                res,
                `Store is already ${is_active ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.INACTIVE}`,
                STATUS_CODES.CONFLICT
            );
        }

        if (!is_active) {
            const STORE_BLOCKING_STATUSES = [
                BOOKING_STATUS.STORE_ASSIGNED,
                BOOKING_STATUS.DRIVER_ASSIGNED,
                BOOKING_STATUS.DRIVER_ARRIVED,
                BOOKING_STATUS.PICKED_UP,
                BOOKING_STATUS.STORED,
                BOOKING_STATUS.RETURN_REQUESTED,
                BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
            ];

            const activeBookingCount = await Booking.countDocuments({
                storeId: store_id,
                status: { $in: STORE_BLOCKING_STATUSES },
                isActive: true,
            });

            if (activeBookingCount > 0) {
                return sendError(
                    res,
                    `Cannot deactivate store — ${activeBookingCount} active booking(s) in progress. Resolve them before deactivating.`,
                    STATUS_CODES.CONFLICT
                );
            }
        }

        const updateData = {
            is_active,
            status_updated_by: auth_id,
            status_updated_at: new Date(),
        };

        if (!is_active) {
            updateData.store_deactivated_reason = reason ?? null;
            updateData.deactivated_at = new Date();       // ✅ Added from fixed schema
            updateData.deactivated_by = auth_id;          // ✅ Added from fixed schema
            updateData.is_online = false;
        }

        if (is_active) {
            updateData.store_deactivated_reason = null;
            updateData.deactivated_at = null;             // ✅ Clear on reactivation
            updateData.deactivated_by = null;             // ✅ Clear on reactivation
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
        console.error("[toggleStoreStatus] Error:", err);
        return sendError(res, "Failed to update store status");
    }
};

// ── UPDATE STORE VERIFICATION ─────────────────────────────────────
export const updateStoreVerification = async (req, res) => {
    try {
        const { store_id } = req.params;
        const { auth_id } = req.user;
        const { verification_status, status } = req.body;

        const store = await Store.findOne({
            _id: store_id,
            is_deleted: { $ne: true },
        })
            .select("verification_status status store_name")
            .lean();

        if (!store) {
            return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        }

        if (store.verification_status === verification_status) {
            return sendError(
                res,
                `Store verification is already ${verification_status}`,
                STATUS_CODES.CONFLICT
            );
        }

        const updateData = {
            verification_status,
            status_updated_by: auth_id,
            status_updated_at: new Date(),
        };

        if (verification_status === VERIFICATION_STATUS.VERIFIED) {
            updateData.status = ACCOUNT_STATUS.ACTIVE;
            updateData.verified_by = auth_id;
            updateData.verified_at = new Date(); // ✅ Added from fixed schema
            updateData.is_verified = true;
        }

        if (verification_status === VERIFICATION_STATUS.REJECTED) {
            updateData.status = ACCOUNT_STATUS.INACTIVE;
            updateData.is_verified = false;
        }

        if (status !== undefined) {
            updateData.status = status;
        }

        const updatedStore = await Store.findByIdAndUpdate(
            store_id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        await invalidateStoreCache(store_id);

        return sendResponse({
            res,
            message: "Store verification updated successfully",
            data: updatedStore,
        });
    } catch (err) {
        console.error("[updateStoreVerification] Error:", err);
        return sendError(res, "Failed to update store verification");
    }
};