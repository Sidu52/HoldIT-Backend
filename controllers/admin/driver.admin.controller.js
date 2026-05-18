import mongoose from "mongoose";
import Driver from "../../models/Driver.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, ACCOUNT_STATUS } from "../../utils/constants.js";
import logger from "../../utils/logger.js";


// CONSTANTS
const LIST_CACHE_TTL = 120; // 2 minutes
const DETAIL_CACHE_TTL = 300; // 5 minutes
const EXCLUDED_FIELDS = "-password_hash -__v";

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
            promises.push(del(`driver:profile:${driverId}`));
        }
        await Promise.all(promises);
    } catch (err) {
        logger.error("Cache invalidation error:", err);
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
        logger.error("Get Drivers Error:", err);
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
        logger.error("Get Driver By ID Error:", err);
        return sendError(res, "Failed to fetch driver");
    }
};

// UPDATE DRIVER
export const updateDriver = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { auth_id } = req.user;
        const {
            first_name,
            last_name,
            phone,
            email,
            gender,
            date_of_birth,
            address,
            vehicle_type,
            license_number,
            service_area_id,
        } = req.body;

        const driver = await Driver.findById(driver_id)
            .select("_id is_active")
            .lean();

        if (!driver) {
            return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
        }

        // Check email/phone uniqueness if being updated
        if (email || phone) {
            const conflict = await Driver.findOne({
                _id: { $ne: driver_id },
                $or: [
                    ...(email ? [{ email }] : []),
                    ...(phone ? [{ phone }] : []),
                ],
            }).select("_id email phone").lean();

            if (conflict) {
                return sendError(
                    res,
                    conflict.email === email
                        ? "Email already in use by another driver"
                        : "Phone already in use by another driver",
                    STATUS_CODES.CONFLICT
                );
            }
        }

        const updateFields = {
            updated_at: new Date(),
            updated_by: auth_id,
            ...(first_name && { first_name }),
            ...(last_name && { last_name }),
            ...(phone && { phone }),
            ...(email && { email }),
            ...(gender && { gender }),
            ...(date_of_birth && { date_of_birth: new Date(date_of_birth) }),
            ...(address && { address }),
            ...(vehicle_type && { vehicle_type }),
            ...(license_number && { license_number }),
            ...(service_area_id && { service_area_id }),
        };

        const updatedDriver = await Driver.findByIdAndUpdate(
            driver_id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        return sendResponse({
            res,
            message: "Driver updated successfully",
            data: updatedDriver,
        });
    } catch (err) {
        logger.error("[updateDriver] Error:", err);
        return sendError(res, "Failed to update driver");
    }
};

export const updateDriverLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { auth_id } = req.user;
        const { lat, lng, address } = req.body;

        const driver = await Driver.findById(id)
            .select("_id is_active")
            .lean();

        if (!driver) {
            return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
        }

        if (!driver.is_active) {
            return sendError(res, "Driver account is not active", STATUS_CODES.FORBIDDEN);
        }

        const updatedDriver = await Driver.findByIdAndUpdate(
            id,
            {
                $set: {
                    currentLocation: {
                        lat,
                        lng,
                        address: address ?? "",
                        lastUpdated: new Date(),
                    },
                    updated_at: new Date(),
                    updated_by: auth_id,
                },
            },
            { new: true, runValidators: true }
        )
            .select("_id currentLocation updated_at")
            .lean();

        return sendResponse({
            res,
            message: "Driver location updated successfully",
            data: updatedDriver,
        });
    } catch (err) {
        logger.error("[updateDriverLocation] Error:", err);
        return sendError(res, "Failed to update driver location");
    }
};

export const updateDriverAccount = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { auth_id } = req.user;

        const {
            status,
            is_active,
            is_Online,
            is_on_trip,
            is_verified,
            is_serviceable,
            verification_status,
            reason, // deactivation reason from updateDriverStatus
        } = req.body;

        // ✅ Fixed: select all fields used in guards below
        const driver = await Driver.findById(driver_id)
            .select("_id status is_active is_on_trip is_verified verification_status")
            .lean();

        if (!driver) {
            return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
        }

        // Guard: same status conflict (from updateDriverStatus)
        if (status !== undefined && driver.status === status) {
            return sendError(
                res,
                `Driver status is already ${status}`,
                STATUS_CODES.CONFLICT
            );
        }

        // Guard: same is_active conflict (from updateDriverStatus)
        if (is_active !== undefined && driver.is_active === is_active) {
            return sendError(
                res,
                `Driver is already ${is_active ? "active" : "inactive"}`,
                STATUS_CODES.CONFLICT
            );
        }

        // Guard: cannot deactivate a driver on a trip (fixed: now is_on_trip is actually selected)
        if (is_active === false && driver.is_on_trip) {
            return sendError(
                res,
                "Cannot deactivate a driver who is currently on a trip",
                STATUS_CODES.CONFLICT
            );
        }

        // Guard: cannot verify without APPROVED verification status
        if (is_verified === true && driver.verification_status !== DRIVER_VERIFICATION_STATUS.APPROVED) {
            return sendError(
                res,
                "Driver cannot be verified until verification status is APPROVED",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const updateFields = {
            updated_at: new Date(),
            updated_by: auth_id,
            status_updated_by: auth_id,
            ...(status !== undefined && { status }),
            ...(is_active !== undefined && { is_active }),
            ...(is_Online !== undefined && { is_Online }),
            ...(is_on_trip !== undefined && { is_on_trip }),
            ...(is_verified !== undefined && { is_verified }),
            ...(is_serviceable !== undefined && { is_serviceable }),
            ...(verification_status !== undefined && { verification_status }),
        };

        // Deactivation metadata (from updateDriverStatus)
        if (is_active === false) {
            updateFields.account_deactivated_reason = reason ?? null;
            updateFields.deactivated_at = new Date();
            updateFields.deactivated_by = auth_id;
        }

        // Clear deactivation metadata on reactivation (from updateDriverStatus)
        if (is_active === true) {
            updateFields.account_deactivated_reason = null;
            updateFields.deactivated_at = null;
            updateFields.deactivated_by = null;
        }

        const updatedDriver = await Driver.findByIdAndUpdate(
            driver_id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        // Invalidate cache (from updateDriverStatus)
        await invalidateDriverCache(driver_id)
            .catch((err) => logger.warn("[updateDriverAccount] Cache invalidation failed:", err.message));

        return sendResponse({
            res,
            message: "Driver account updated successfully",
            data: updatedDriver,
        });
    } catch (err) {
        logger.error("[updateDriverAccount] Error:", err);
        return sendError(res, "Failed to update driver account");
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
                    status: ACCOUNT_STATUS.INACTIVE,
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
            logger.error("Cache invalidation error:", err)
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

        logger.error("Bulk Deactivate Error:", err);
        return sendError(res, "Failed to deactivate drivers");
    }
};