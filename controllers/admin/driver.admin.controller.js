import mongoose from "mongoose";
import Driver from "../../models/Driver.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, ACCOUNT_STATUS } from "../../utils/constants.js";

// CONSTANTS
const LIST_CACHE_TTL = 120; // 2 minutes
const DETAIL_CACHE_TTL = 300; // 5 minutes
const EXCLUDED_FIELDS = "-password_hash -__v";

const ALLOWED_UPDATE_FIELDS = [
    "first_name",
    "last_name",
    "phone",
    "gender",
    "date_of_birth",
    "address",
    "vehicle_type",
    "license_number",
];

// Escape Regex
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Invalidate Driver Caches
const invalidateDriverCache = async (driverId = null) => {
    try {
        const promises = [delByPattern("drivers:*")];
        if (driverId) {
            promises.push(del(`driver:${driverId}`));
        }
        await Promise.all(promises);
    } catch (err) {
        console.error("Cache invalidation error:", err);
    }
};

// GET DRIVERS (Paginated + Filtered)
export const getDrivers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            search,
            is_online,
            verification_status,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;
        // Already validated by middleware

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter = {};

        if (status) {
            filter.status = status;
        }

        if (is_online !== undefined) {
            filter.is_Online = is_online === "true";
        }

        if (verification_status) {
            filter.verification_status = verification_status;
        }

        if (search) {
            const escapedSearch = escapeRegex(search.trim());
            filter.$or = [
                { first_name: { $regex: escapedSearch, $options: "i" } },
                { last_name: { $regex: escapedSearch, $options: "i" } },
                { email: { $regex: escapedSearch, $options: "i" } },
                { phone: { $regex: escapedSearch, $options: "i" } },
            ];
        }

        // Build sort
        const sortDirection = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDirection };

        // Cache key
        const cacheKey = `drivers:${pageNum}:${limitNum}:${status || "all"}:${search || "none"}:${is_online ?? "all"}:${verification_status || "all"}:${sort_by}:${sort_order}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Drivers fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Execute queries in parallel
        const [drivers, total] = await Promise.all([
            Driver.find(filter)
                .select(EXCLUDED_FIELDS)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Driver.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);

        const responseData = {
            drivers,
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
            message: "Drivers fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Drivers Error:", err);
        return sendError(res, "Failed to fetch drivers");
    }
};

// GET DRIVER BY ID
export const getDriverById = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const cacheKey = `driver:${driver_id}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Driver fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const driver = await Driver.findById(driver_id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!driver) {
            return sendError(
                res,
                "Driver not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        await set(cacheKey, JSON.stringify(driver), "EX", DETAIL_CACHE_TTL);

        return sendResponse({
            res,
            message: "Driver fetched successfully",
            data: driver,
        });
    } catch (err) {
        console.error("Get Driver By ID Error:", err);
        return sendError(res, "Failed to fetch driver");
    }
};

// UPDATE DRIVER
export const updateDriver = async (req, res) => {
    try {
        const { driver_id } = req.params;
        // Build update object from allowed fields only
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

        // Check driver exists and is active
        const existingDriver = await Driver.findById(driver_id)
            .select("is_active status")
            .lean();

        if (!existingDriver) {
            return sendError(
                res,
                "Driver not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        if (!existingDriver.is_active) {
            return sendError(
                res,
                "Cannot update inactive driver. Reactivate first.",
                STATUS_CODES.FORBIDDEN
            );
        }

        const updatedDriver = await Driver.findByIdAndUpdate(
            driver_id,
            { $set: updates },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Invalidate cache
        await invalidateDriverCache(driver_id);

        return sendResponse({
            res,
            message: "Driver updated successfully",
            data: updatedDriver,
        });
    } catch (err) {
        // Handle duplicate key errors
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(
                res,
                `${field} already exists`,
                STATUS_CODES.CONFLICT
            );
        }

        console.error("Update Driver Error:", err);
        return sendError(res, "Failed to update driver");
    }
};

// UPDATE DRIVER STATUS
export const updateDriverStatus = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { status, reason, is_active } = req.body;
        const { auth_id } = req.user;

        const driver = await Driver.findById(driver_id)
            .select("status is_active")
            .lean();

        if (!driver) {
            return sendError(
                res,
                "Driver not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Build update
        const updateData = {
            updated_at: new Date(),
            status_updated_by: auth_id,
        };

        if (status !== undefined) {
            if (driver.status === status) {
                return sendError(
                    res,
                    `Driver is already ${status}`,
                    STATUS_CODES.CONFLICT
                );
            }
            updateData.status = status;
        }

        if (is_active !== undefined) {
            if (driver.is_active === is_active) {
                return sendError(
                    res,
                    `Driver is already ${is_active ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.INACTIVE}`,
                    STATUS_CODES.CONFLICT
                );
            }
            updateData.is_active = is_active;

            if (!is_active && reason) {
                updateData.account_deactivated_reason = reason;
                updateData.deactivated_at = new Date();
                updateData.deactivated_by = auth_id;
            }

            if (is_active) {
                // Clear deactivation data on reactivation
                updateData.account_deactivated_reason = null;
                updateData.deactivated_at = null;
                updateData.deactivated_by = null;
            }
        }

        const updatedDriver = await Driver.findByIdAndUpdate(
            driver_id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Invalidate cache
        await invalidateDriverCache(driver_id);

        return sendResponse({
            res,
            message: "Driver status updated successfully",
            data: updatedDriver,
        });
    } catch (err) {
        console.error("Update Driver Status Error:", err);
        return sendError(res, "Failed to update driver status");
    }
};

// BULK DEACTIVATE DRIVERS
export const bulkDeactivateDrivers = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const { ids, reason } = req.body;
        const { auth_id } = req.user;
        // Check which drivers exist and are currently active
        const activeDrivers = await Driver.find({
            _id: { $in: ids },
            is_active: true,
        })
            .select("_id")
            .session(session)
            .lean();

        if (activeDrivers.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return sendError(
                res,
                "No active drivers found with the provided IDs",
                STATUS_CODES.NOT_FOUND
            );
        }

        const activeIds = activeDrivers.map((d) => d._id);

        // Bulk deactivate
        const result = await Driver.updateMany(
            { _id: { $in: activeIds } },
            {
                $set: {
                    is_active: false,
                    account_deactivated_reason: reason,
                    deactivated_at: new Date(),
                    deactivated_by: auth_id,
                },
            }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        // Invalidate caches
        Promise.all([
            ...activeIds.map((id) => del(`driver:${id}`)),
            delByPattern("drivers:*"),
        ]).catch((err) =>
            console.error("Cache invalidation error:", err)
        );

        return sendResponse({
            res,
            message: `${result.modifiedCount} driver(s) deactivated successfully`,
            data: {
                requested: ids.length,
                deactivated: result.modifiedCount,
                alreadyInactive: ids.length - activeDrivers.length,
            },
        });
    } catch (err) {
        // Safe transaction abort
        try {
            await session.abortTransaction();
        } catch (_) { }
        session.endSession();

        console.error("Bulk Deactivate Error:", err);
        return sendError(res, "Failed to deactivate drivers");
    }
};