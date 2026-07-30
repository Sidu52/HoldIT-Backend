import mongoose from "mongoose";
import Driver from "../../models/Driver.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { STATUS_CODES, ACCOUNT_STATUS } from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { escapeRegex } from "../../utils/helper.js";
import { updateDriverLocation } from "../../services/driverGeoService.js";
import { cacheAside, deleteByPattern, deleteCache, deleteManyCache } from "../../constants/redis/redisOperation.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";
import { ExcludedFields } from "../../helpers/admin/admin.js";
import { AuthKeys } from "../../constants/redis/auth.keys.js";
import { DriverKeys } from "../../constants/redis/driver.keys.js";


const invalidateDriverCache = async (driverId) => {
    const results = await Promise.allSettled([
        deleteCache(AdminKeys.driverDetail(driverId)),
        deleteCache(DriverKeys.profile(driverId)),
        deleteCache(DriverKeys.meta(driverId)),
        deleteByPattern(AdminKeys.driverListPattern()),
    ]);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateDriverCache]", r.reason?.message));
};


// GET DRIVERS
export const getDrivers = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, account_status, search,
            is_online, sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = AdminKeys.driverList(
            { page: pageNum, limit: limitNum, account_status, is_online, search: search || "none", sort_by, sort_order }
        )

        const responseData = await cacheAside(cacheKey, AdminTTL.DRIVER_LIST, async () => {
            const filter = {
                ...(account_status && { account_status }),
                ...(is_online !== undefined && { is_online }),
            };
            if (search) {
                const escaped = escapeRegex(search.trim());
                const r = { $regex: escaped, $options: "i" };
                filter.$or = [{ first_name: r }, { last_name: r }, { email: r }, { phone: r }];
            }
            const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
            const skip = (pageNum - 1) * limitNum;
            const [drivers, total] = await Promise.all([
                Driver.find(filter).select(ExcludedFields).sort(sort).skip(skip).limit(limitNum).lean(),
                Driver.countDocuments(filter),
            ]);
            const totalPages = Math.ceil(total / limitNum);
            return {
                drivers,
                pagination: {
                    currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
                    hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
                },
            };
        }); 
        return sendResponse({ res, message: "Drivers fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getDrivers] Error:", err);
        return sendError(res, "Failed to fetch drivers");
    }
};

// GET DRIVER BY ID
export const getDriverById = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const driver = await cacheAside(AdminKeys.driverDetail(driver_id), AdminTTL.DRIVER_DETAIL, async () => await Driver.findById(driver_id).select(ExcludedFields).lean());
        if (!driver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
        return sendResponse({ res, message: "Driver fetched successfully", data: driver });
    } catch (err) {
        logger.error("[getDriverById] Error:", err);
        return sendError(res, "Failed to fetch driver");
    }
};

// UPDATE DRIVER
export const updateDriver = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { auth_id } = req.user;
        const { first_name, last_name, phone, email, gender, date_of_birth, address, vehicle_type, license_number, verification_status } = req.body;

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
                    conflict.email === email ? "Email already in use by another driver" : "Phone already in use by another driver",
                    STATUS_CODES.CONFLICT
                );
            }
        }

        const updateFields = {
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
            ...(verification_status && Object.values(VERIFICATION_STATUS).includes(verification_status) && { verification_status }),
        };

        if (Object.keys(updateFields).length === 1) { // only `updated_by` present
            return sendError(res, "No fields provided to update", STATUS_CODES.BAD_REQUEST);
        }

        let updatedDriver;
        try {
            updatedDriver = await Driver.findByIdAndUpdate(
                driver_id, { $set: updateFields }, { new: true, runValidators: true }
            ).select(ExcludedFields).lean();
        } catch (err) {
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern || {})[0];
                return sendError(res, `${field === "email" ? "Email" : "Phone"} already in use by another driver`, STATUS_CODES.CONFLICT);
            }
            throw err;
        }

        if (!updatedDriver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);

        await invalidateDriverCache(driver_id);
        results.forEach((r) => r.status === "rejected" && logger.warn("[updateDriver] cache sync failed:", r.reason?.message));

        
        return sendResponse({ res, message: "Driver updated successfully", data: updatedDriver });
    } catch (err) {
        logger.error("[updateDriver] Error:", err);
        return sendError(res, "Failed to update driver");
    }
};

// UPDATE DRIVER LOCATION
export const driverLocation = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { auth_id } = req.user;
        const { lat, lng, address } = req.body;

        const latitude = Number(lat);
        const longitude = Number(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return sendError(res, "Latitude and longitude are required", STATUS_CODES.BAD_REQUEST);
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return sendError(res, "Invalid latitude or longitude", STATUS_CODES.BAD_REQUEST);
        }

        const driver = await Driver.findById(driver_id).select("_id auth_id account_status service_area_id").lean();
        if (!driver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);

        if (!driver.auth_id || driver.auth_id.toString() !== auth_id.toString()) {
            return sendError(res, "Unauthorized access", STATUS_CODES.FORBIDDEN);
        }
        if (driver.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Driver account is not active", STATUS_CODES.FORBIDDEN);
        }

        const redisUpdated = await updateDriverLocation(driver_id, longitude, latitude, driver.service_area_id);
        if (!redisUpdated) {
            logger.error(`[driverLocation] Redis update failed for driver ${driver_id}`);
            return sendError(res, "Failed to update driver location", STATUS_CODES.INTERNAL_SERVER_ERROR);
        }

        Driver.updateOne(
            { _id: driver_id },
            { $set: { currentLocation: { type: "Point", coordinates: [longitude, latitude], address: address?.trim() || "", updatedAt: new Date() }, updated_by: auth_id } },
            { runValidators: true }
        ).catch((err) => logger.warn(`[driverLocation] Mongo location sync failed for driver ${driver_id}:`, err.message));

        await invalidateDriverCache(driver_id);

        return sendResponse({ res, message: "Driver location updated successfully", data: { driver_id, lat: latitude, lng: longitude, updated_at: new Date() } });
    } catch (err) {
        logger.error("[driverLocation] Error:", err);
        return sendError(res, "Failed to update driver location", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};
// UPDATE DRIVER STATUS
export const updateDriverStatus = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { account_status, account_deactivated_reason } = req.body;
        const { auth_id } = req.user;

        const isDeactivating = account_status === ACCOUNT_STATUS.INACTIVE || account_status === ACCOUNT_STATUS.BLOCKED;

        const updateFilter = {
            _id: driver_id,
            account_status: { $ne: account_status },
            ...(isDeactivating && { is_on_trip: { $ne: true } }),
        };

        const updatedDriver = await Driver.findOneAndUpdate(
            updateFilter,
            {
                $set: {
                    account_status,
                    account_deactivated_reason,
                    updated_by: auth_id,
                    ...(isDeactivating && { is_online: false }),
                },
            },
            { new: true, runValidators: true }
        ).select("_id account_status account_deactivated_reason updated_by").lean();

        if (!updatedDriver) {
            const current = await Driver.findById(driver_id).select("account_status is_on_trip").lean();
            if (!current) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
            if (current.account_status === account_status) {
                return sendError(res, `Driver account status is already ${account_status}`, STATUS_CODES.CONFLICT);
            }
            if (isDeactivating && current.is_on_trip) {
                return sendError(res, "Cannot deactivate a driver who is currently on a trip", STATUS_CODES.CONFLICT);
            }
            return sendError(res, "Failed to update driver status", STATUS_CODES.CONFLICT);
        }

        const sideEffects = [
            deleteCache(DriverKeys.profile(driver_id)),
            deleteByPattern(AdminKeys.driverListPattern()),
        ];
        if (isDeactivating) {
            sideEffects.push(deleteByPattern(AuthKeys.refreshTokenPattern(NS.DRIVER, driver_id)));
        }

        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[updateDriverStatus] cache sync failed:", r.reason?.message));

        await invalidateDriverCache(driver_id);
        return sendResponse({ res, message: "Driver account updated successfully", data: updatedDriver });
    } catch (err) {
        logger.error("[updateDriverStatus] Error:", err);
        return sendError(res, "Failed to update driver status");
    }
};

// BULK DEACTIVATE DRIVERS
const MAX_BULK_SIZE = 50;
export const bulkDeactivateDrivers = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { ids, reason } = req.body;
        const { auth_id } = req.user;

        if (!Array.isArray(ids) || ids.length === 0) {
            await session.abortTransaction(); session.endSession();
            return sendError(res, "No driver IDs provided", STATUS_CODES.BAD_REQUEST);
        }
        if (ids.length > MAX_BULK_SIZE) {
            await session.abortTransaction(); session.endSession();
            return sendError(res, `Cannot process more than ${MAX_BULK_SIZE} accounts at once`, STATUS_CODES.BAD_REQUEST);
        }

        const uniqueIds = [...new Set(ids.map(String))];

        // find which of these were even candidates BEFORE the atomic write, for accurate reporting
        const candidateCount = await Driver.countDocuments({
            _id: { $in: uniqueIds },
            account_status: ACCOUNT_STATUS.ACTIVE,
        }).session(session);

        if (candidateCount === 0) {
            await session.abortTransaction(); session.endSession();
            return sendError(res, "No active drivers found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        // atomic — is_on_trip re-checked AT WRITE TIME, not from a stale earlier read
        const result = await Driver.updateMany(
            { _id: { $in: uniqueIds }, account_status: ACCOUNT_STATUS.ACTIVE, is_on_trip: false },
            { $set: { account_status: ACCOUNT_STATUS.INACTIVE, account_deactivated_reason: reason, updated_by: auth_id } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        const sideEffects = [
            deleteManyCache(uniqueIds.map((id) => DriverKeys.profile(id))),
            deleteByPattern(AdminKeys.driverListPattern()),
            ...uniqueIds.map((id) => deleteByPattern(AuthKeys.refreshTokenPattern(NS.DRIVER, id))),
        ];
        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[bulkDeactivateDrivers] side effect failed:", r.reason?.message));

        return sendResponse({
            res,
            message: `${result.modifiedCount} driver(s) deactivated successfully`,
            data: {
                requested: uniqueIds.length,
                deactivated: result.modifiedCount,
                skipped: uniqueIds.length - result.modifiedCount, // covers not-found, already-inactive, AND on-trip
            },
        });
    } catch (err) {
        try { await session.abortTransaction(); } catch (_) { }
        session.endSession();
        logger.error("[bulkDeactivateDrivers] Error:", err);
        return sendError(res, "Failed to deactivate drivers");
    }
};

// Update Drive is_on_duty or is_online and online offline
export const updateDriverDuty = async (req, res) => {
    try {
        const { driver_id } = req.params;
        const { auth_id } = req.user;
        const { is_on_duty, is_online } = req.body;

        const goingOffline = is_on_duty === false || is_online === false;

        const updatedDriver = await Driver.findOneAndUpdate(
            {
                _id: driver_id,
                account_status: ACCOUNT_STATUS.ACTIVE,
                ...(goingOffline && { is_on_trip: { $ne: true } }),
            },
            {
                $set: {
                    ...(is_on_duty !== undefined && { is_on_duty }),
                    ...(is_online !== undefined && { is_online }),
                    updated_by: auth_id,
                },
            },
            { new: true, runValidators: true }
        ).select("_id is_on_duty is_online updated_by").lean();

        if (!updatedDriver) {
            const current = await Driver.findById(driver_id).select("account_status is_on_trip").lean();
            if (!current) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
            if (current.account_status !== ACCOUNT_STATUS.ACTIVE) {
                return sendError(res, "Driver account is not active", STATUS_CODES.FORBIDDEN);
            }
            if (goingOffline && current.is_on_trip) {
                return sendError(res, "Cannot go off duty while on an active trip", STATUS_CODES.CONFLICT);
            }
            return sendError(res, "Failed to update driver duty status", STATUS_CODES.CONFLICT);
        }

        const results = await Promise.allSettled([
            deleteCache(DriverKeys.profile(driver_id)),
            deleteByPattern(AdminKeys.driverListPattern()),
        ]);
        results.forEach((r) => r.status === "rejected" && logger.warn("[updateDriverDuty] cache sync failed:", r.reason?.message));

        await invalidateDriverCache(driver_id);
        return sendResponse({ res, message: "Driver duty updated successfully", data: updatedDriver });
    } catch (err) {
        logger.error("[updateDriverDuty] Error:", err);
        return sendError(res, "Failed to update driver duty");
    }
};