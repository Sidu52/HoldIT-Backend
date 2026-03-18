import StoreOwner from "../../models/StoreOwner.js";
import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, ACCOUNT_STATUS, ON_BOARDING_STATUS } from "../../utils/constants.js";

// ============================================
// CONSTANTS
// ============================================
const LIST_CACHE_TTL = 120;
const DETAIL_CACHE_TTL = 300;
const EXCLUDED_FIELDS = "-__v"; // ✅ Fixed: StoreOwner has no password_hash

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
// 1. CREATE STORE OWNER — ✅ New
// ============================================
export const createStoreOwner = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const {
            first_name,
            last_name,
            phone,
            email,
            gender,
            date_of_birth,
            address,
        } = req.body;

        // Check phone uniqueness
        const existingPhone = await StoreOwner.findOne({ phone })
            .select("_id")
            .lean();

        if (existingPhone) {
            return sendError(
                res,
                "A store owner with this phone already exists",
                STATUS_CODES.CONFLICT
            );
        }

        // Check email uniqueness if provided
        if (email) {
            const existingEmail = await StoreOwner.findOne({ email })
                .select("_id")
                .lean();

            if (existingEmail) {
                return sendError(
                    res,
                    "A store owner with this email already exists",
                    STATUS_CODES.CONFLICT
                );
            }
        }

        const owner = await StoreOwner.create({
            first_name: first_name.trim(),
            last_name: last_name?.trim() ?? "",
            phone,
            email: email?.toLowerCase().trim() ?? null,
            gender: gender ?? null,
            date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
            address: address?.trim() ?? null,
            status: ACCOUNT_STATUS.PENDING,
            is_active: true,
            is_verified: false,
            onboarding_status: ON_BOARDING_STATUS.PENDING,
            updated_by: auth_id,
        });

        await invalidateOwnerCache();

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Store owner created successfully",
            data: { owner },
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(
                res,
                `A store owner with this ${field} already exists`,
                STATUS_CODES.CONFLICT
            );
        }
        console.error("[createStoreOwner] Error:", err);
        return sendError(res, "Failed to create store owner");
    }
};

// ============================================
// 2. GET STORE OWNERS (Paginated)
// ============================================
export const getStoreOwners = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            is_active,
            is_verified,
            onboarding_status,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // ✅ Fixed: StoreOwner has no is_deleted field
        const filter = {};

        if (status) filter.status = status;
        if (onboarding_status) filter.onboarding_status = onboarding_status;

        // ✅ Fixed: cast booleans from query strings
        if (is_active !== undefined) filter.is_active = is_active === "true";
        if (is_verified !== undefined) filter.is_verified = is_verified === "true";

        if (search) {
            const escaped = escapeRegex(search.trim());
            // ✅ Fixed: first_name/last_name not "name", no email on schema
            filter.$or = [
                { first_name: { $regex: escaped, $options: "i" } },
                { last_name:  { $regex: escaped, $options: "i" } },
                { phone:      { $regex: escaped, $options: "i" } },
            ];
        }

        const sortDir = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDir };

        const cacheKey = buildCacheKey("store_owners", {
            page: pageNum, limit: limitNum,
            status, is_active, is_verified,
            onboarding_status, search, sort_by, sort_order,
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

        await set(cacheKey, JSON.stringify(responseData), "EX", LIST_CACHE_TTL);

        return sendResponse({
            res,
            message: "Store owners fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("[getStoreOwners] Error:", err);
        return sendError(res, "Failed to fetch store owners");
    }
};

// ============================================
// 3. GET STORE OWNER BY ID
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

        // ✅ Fixed: no is_deleted on StoreOwner
        const owner = await StoreOwner.findById(store_owner_id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!owner) {
            return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);
        }

        // Fetch associated stores
        const stores = await Store.find({ store_owner_id })
            .select("store_name is_active is_online status verification_status location")
            .lean();

        const responseData = { ...owner, stores };

        await set(cacheKey, JSON.stringify(responseData), "EX", DETAIL_CACHE_TTL);

        return sendResponse({
            res,
            message: "Store owner fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("[getStoreOwnerById] Error:", err);
        return sendError(res, "Failed to fetch store owner");
    }
};

// ============================================
// 4. UPDATE STORE OWNER
// ============================================
export const updateStoreOwner = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const { auth_id } = req.user;
        const {
            first_name,
            last_name,
            phone,
            email,
            gender,
            date_of_birth,
            address,
        } = req.body;

        // ✅ Fixed: no is_deleted on StoreOwner
        const owner = await StoreOwner.findById(store_owner_id)
            .select("_id phone email")
            .lean();

        if (!owner) {
            return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);
        }

        // Check phone/email uniqueness if being changed
        if (phone || email) {
            const conflict = await StoreOwner.findOne({
                _id: { $ne: store_owner_id },
                $or: [
                    ...(phone ? [{ phone }] : []),
                    ...(email ? [{ email }] : []),
                ],
            }).select("_id phone email").lean();

            if (conflict) {
                return sendError(
                    res,
                    conflict.phone === phone
                        ? "Phone already in use by another store owner"
                        : "Email already in use by another store owner",
                    STATUS_CODES.CONFLICT
                );
            }
        }

        // ✅ Fixed: correct field names from schema
        const updateFields = {
            updated_at: new Date(),
            updated_by: auth_id,
            ...(first_name    && { first_name: first_name.trim() }),
            ...(last_name     && { last_name: last_name.trim() }),
            ...(phone         && { phone }),
            ...(email         && { email: email.toLowerCase().trim() }),
            ...(gender        && { gender }),
            ...(date_of_birth && { date_of_birth: new Date(date_of_birth) }),
            ...(address       && { address: address.trim() }),
        };

        const updatedOwner = await StoreOwner.findByIdAndUpdate(
            store_owner_id,
            { $set: updateFields },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        await invalidateOwnerCache(store_owner_id);

        return sendResponse({
            res,
            message: "Store owner updated successfully",
            data: updatedOwner,
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] ?? "field";
            return sendError(
                res,
                `${field} already in use`,
                STATUS_CODES.CONFLICT
            );
        }
        console.error("[updateStoreOwner] Error:", err);
        return sendError(res, "Failed to update store owner");
    }
};

export const updateStoreOwnerStatus = async (req, res) => {
    try {
        const { store_owner_id } = req.params;
        const { status, reason } = req.body;
        const { auth_id } = req.user;

        const owner = await StoreOwner.findById(store_owner_id)
            .select("status is_active first_name last_name")
            .lean();

        if (!owner) {
            return sendError(res, "Store owner not found", STATUS_CODES.NOT_FOUND);
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
            updated_by: auth_id,
            updated_at: new Date(),
        };

        if (status === ACCOUNT_STATUS.BLOCKED) {
            updateData.is_active = false;
            // ✅ Fixed: schema field is account_deactivated_reason
            updateData.account_deactivated_reason = reason ?? null;
            updateData.deactivated_at = new Date();   // ✅ Added
            updateData.deactivated_by = auth_id;      // ✅ Added

            // Block all their stores — cascade
            await Store.updateMany(
                { store_owner_id },
                {
                    $set: {
                        is_active: false,
                        is_online: false,
                        // ✅ Fixed: schema field is store_deactivated_reason
                        store_deactivated_reason: "Owner account blocked",
                        deactivated_at: new Date(),
                        deactivated_by: auth_id,
                    },
                }
            );

            // Invalidate all store caches
            await delByPattern("stores:*");
        }

        // Reactivation — clear deactivation data
        if (status === ACCOUNT_STATUS.ACTIVE) {
            updateData.is_active = true;
            updateData.account_deactivated_reason = null;
            updateData.deactivated_at = null;
            updateData.deactivated_by = null;
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
        console.error("[updateStoreOwnerStatus] Error:", err);
        return sendError(res, "Failed to update store owner status");
    }
};