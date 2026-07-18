import mongoose from "mongoose";
import Driver from "../../models/Driver.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { getCache, setCache, deleteCache, deleteManyCache, deleteByPattern } from "../../utils/cache.js";
import { buildCacheKey } from "../../utils/cache.js";
import { STATUS_CODES, ACCOUNT_STATUS, CACHE_TTL } from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { escapeRegex } from "../../utils/helper.js";
import { updateDriverLocation } from "../../services/driverGeoService.js";

const EXCLUDED_FIELDS = "-password_hash -__v";

// Key Builders
const driverKey = (id) => buildCacheKey("driver", { id: String(id) });
const driverListPattern = "drivers:*";

// GET DRIVERS
export const getDrivers = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, account_status, search,
            is_online, sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = buildCacheKey("drivers", {
            page: pageNum, limit: limitNum,
            account_status, is_online,
            search: search || "none", sort_by, sort_order,
        });

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Drivers fetched successfully", data: cached });

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
            Driver.find(filter).select(EXCLUDED_FIELDS).sort(sort).skip(skip).limit(limitNum).lean(),
            Driver.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            drivers,
            pagination: {
                currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
            },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.LIST);
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
        const cacheKey = driverKey(driver_id);

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Driver fetched successfully", data: cached });

        const driver = await Driver.findById(driver_id).select(EXCLUDED_FIELDS).lean();
        if (!driver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);

        await setCache(cacheKey, driver, CACHE_TTL.DETAIL);
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

        const driver = await Driver.findById(driver_id).select("_id phone").lean();
        if (!driver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);

        if (email || phone) {
            const conflict = await Driver.findOne({
                _id: { $ne: driver_id },
                $or: [
                    ...(email ? [{ email }] : []),
                    ...(phone && phone !== driver.phone ? [{ phone }] : []),
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
            ...(verification_status && { verification_status }),
        };

        const updatedDriver = await Driver.findByIdAndUpdate(
            driver_id, { $set: updateFields }, { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        await Promise.all([
            deleteCache(driverKey(driver_id)),
            deleteByPattern(driverListPattern),
        ]);

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

        if (driver.auth_id && driver.auth_id.toString() !== auth_id.toString()) {
            return sendError(res, "Unauthorized access", STATUS_CODES.FORBIDDEN);
        }
        if (driver.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Driver account is not active", STATUS_CODES.FORBIDDEN);
        }

        const [redisUpdated] = await Promise.all([
            updateDriverLocation(driver_id, longitude, latitude, driver.service_area_id),
            Driver.updateOne({ _id: driver_id }, {
                $set: {
                    currentLocation: { type: "Point", coordinates: [longitude, latitude], address: address?.trim() || "", updatedAt: new Date() },
                    updated_by: auth_id,
                },
            }, { runValidators: true }),
        ]);

        if (!redisUpdated) {
            logger.error(`[driverLocation] Redis update failed for driver ${driver_id}`);
            return sendError(res, "Failed to update driver location", STATUS_CODES.INTERNAL_SERVER_ERROR);
        }

        await deleteCache(driverKey(driver_id));

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

        const driver = await Driver.findById(driver_id).select("_id account_status is_on_trip").lean();
        if (!driver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
        if (driver.account_status === account_status) {
            return sendError(res, `Driver account status is already ${account_status}`, STATUS_CODES.CONFLICT);
        }

        const isDeactivating = account_status === ACCOUNT_STATUS.INACTIVE || account_status === ACCOUNT_STATUS.BLOCKED;
        if (isDeactivating && driver.is_on_trip) {
            return sendError(res, "Cannot deactivate a driver who is currently on a trip", STATUS_CODES.CONFLICT);
        }

        const updatedDriver = await Driver.findByIdAndUpdate(driver_id, {
            $set: {
                account_status,
                account_deactivated_reason,
                updated_by: auth_id,
                ...(isDeactivating && { is_online: false }),
            },
        }, { new: true, runValidators: true }).select("_id account_status account_deactivated_reason updated_by").lean();

        await Promise.all([
            deleteCache(driverKey(driver_id)),
            deleteByPattern(driverListPattern),
        ]);

        return sendResponse({ res, message: "Driver account updated successfully", data: updatedDriver });
    } catch (err) {
        logger.error("[updateDriverStatus] Error:", err);
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

        if (!Array.isArray(ids) || ids.length === 0) {
            await session.abortTransaction(); session.endSession();
            return sendError(res, "No driver IDs provided", STATUS_CODES.BAD_REQUEST);
        }

        const activeDrivers = await Driver.find({
            _id: { $in: ids },
            account_status: ACCOUNT_STATUS.ACTIVE,
            is_on_trip: false,
        }).select("_id").session(session).lean();

        if (activeDrivers.length === 0) {
            await session.abortTransaction(); session.endSession();
            return sendError(res, "No active drivers found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        const activeIds = activeDrivers.map((d) => d._id);

        const result = await Driver.updateMany(
            { _id: { $in: activeIds } },
            { $set: { account_status: ACCOUNT_STATUS.INACTIVE, account_deactivated_reason: reason, updated_by: auth_id } }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        await Promise.all([
            deleteManyCache(activeIds.map((id) => driverKey(id))),
            deleteByPattern(driverListPattern),
        ]);

        return sendResponse({
            res,
            message: `${result.modifiedCount} driver(s) deactivated successfully`,
            data: { requested: ids.length, deactivated: result.modifiedCount, alreadyInactive: ids.length - activeDrivers.length },
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

        const driver = await Driver.findById(driver_id).select("_id account_status is_on_trip").lean();
        if (!driver) return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
        if (driver.account_status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(res, "Driver account is not active", STATUS_CODES.FORBIDDEN);
        }

        const isDeactivating = driver.is_on_trip;
        if (isDeactivating && is_on_duty) {
            return sendError(res, "Cannot deactivate a driver who is currently on a trip", STATUS_CODES.CONFLICT);
        }

        const updatedDriver = await Driver.findByIdAndUpdate(driver_id, {
            $set: {
                is_on_duty,
                is_online,
                updated_by: auth_id,
                ...(isDeactivating && { is_on_trip: false }),
            },
        }, { new: true, runValidators: true }).select("_id is_on_duty is_online updated_by").lean();

        await Promise.all([
            deleteCache(driverKey(driver_id)),
            deleteByPattern(driverListPattern),
        ]);

        return sendResponse({ res, message: "Driver duty updated successfully", data: updatedDriver });
    } catch (err) {
        logger.error("[updateDriverDuty] Error:", err);
        return sendError(res, "Failed to update driver duty");
    }
};