import ServiceableArea from "../../models/ServiceableArea.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { escapeRegex } from "../../utils/helper.js";
import logger from "../../utils/logger.js";
import { cacheAside, deleteCache, deleteByPattern } from "../../constants/redis/redisOperation.js";
import { ServiceableKeys, ServiceableTTL } from "../../constants/redis/serviceable.keys.js";

const invalidateAreaCache = async (id = null) => {
    const jobs = [deleteByPattern(ServiceableKeys.listPattern())];
    if (id) jobs.push(deleteCache(ServiceableKeys.detail(id)));

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateAreaCache]", r.reason?.message));
};

// CREATE
export const createArea = async (req, res) => {
    try {
        const { name, city, state, pincode, location, service_radius_km, delivery_charge } = req.body;

        const area = await ServiceableArea.create({
            name, city, state, pincode, location, service_radius_km, delivery_charge,
            created_by: req.user?.auth_id,
        });

        await invalidateAreaCache();

        return sendResponse({ res, statusCode: STATUS_CODES.CREATED, message: "Area created successfully", data: area });
    } catch (err) {
        if (err.code === 11000) return sendError(res, "Area already exists in this city", STATUS_CODES.CONFLICT);
        logger.error("[createArea] Error:", err);
        return sendError(res, "Failed to create area");
    }
};

// GET LIST
export const getAreas = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, city, state, is_active, search,
            sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = ServiceableKeys.list({ page: pageNum, limit: limitNum, city, state, is_active, search, sort_by, sort_order });

        const responseData = await cacheAside(cacheKey, ServiceableTTL.LIST, async () => {
            const filter = {
                ...(city && { city }),
                ...(state && { state }),
                ...(is_active !== undefined && { is_active: is_active === "true" }),
            };

            if (search) {
                const r = { $regex: escapeRegex(search.trim()), $options: "i" };
                filter.$or = [{ name: r }, { pincode: r }, { city: r }, { state: r }];
            }

            const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
            const skip = (pageNum - 1) * limitNum;

            const [areas, total] = await Promise.all([
                ServiceableArea.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
                ServiceableArea.countDocuments(filter),
            ]);

            const totalPages = Math.ceil(total / limitNum);
            return {
                areas,
                pagination: { currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 },
            };
        });

        return sendResponse({ res, message: "Areas fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getAreas] Error:", err);
        return sendError(res, "Failed to fetch areas");
    }
};

// GET BY ID
export const getAreaById = async (req, res) => {
    try {
        const { id } = req.params;
        const area = await cacheAside(ServiceableKeys.detail(id), ServiceableTTL.DETAIL, () => ServiceableArea.findById(id).lean());
        if (!area) return sendError(res, "Area not found", STATUS_CODES.NOT_FOUND);
        return sendResponse({ res, message: "Area fetched successfully", data: area });
    } catch (err) {
        logger.error("[getAreaById] Error:", err);
        return sendError(res, "Failed to fetch area");
    }
};

// UPDATE
export const updateArea = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, state, pincode, location, service_radius_km, delivery_charge, is_active } = req.body;

        const updates = {
            ...(name !== undefined && { name: name.trim() }),
            ...(city !== undefined && { city: city.trim() }),
            ...(state !== undefined && { state: state.trim() }),
            ...(pincode !== undefined && { pincode: pincode.trim() }),
            ...(service_radius_km !== undefined && { service_radius_km }),
            ...(delivery_charge !== undefined && { delivery_charge }),
            ...(is_active !== undefined && { is_active }),
            ...(location?.coordinates?.length === 2 && { location: { type: "Point", coordinates: location.coordinates } }),
            updated_by: req.user.auth_id,
        };

        if (Object.keys(updates).length === 1) {
            return sendError(res, "No fields provided to update", STATUS_CODES.BAD_REQUEST);
        }

        const area = await ServiceableArea.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).lean();
        if (!area) return sendError(res, "Area not found", STATUS_CODES.NOT_FOUND);

        await invalidateAreaCache(id);
        return sendResponse({ res, message: "Area updated successfully", data: area });
    } catch (err) {
        if (err.code === 11000) return sendError(res, "Area with this name already exists in the city", STATUS_CODES.CONFLICT);
        logger.error("[updateArea] Error:", err);
        return sendError(res, "Failed to update area");
    }
};

// TOGGLE STATUS
export const toggleAreaStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== "boolean") {
            return sendError(res, "is_active (boolean) is required", STATUS_CODES.BAD_REQUEST);
        }

        const area = await ServiceableArea.findByIdAndUpdate(
            id, { $set: { is_active, updated_by: req.user?.auth_id } }, { new: true, runValidators: true }
        ).lean();

        if (!area) return sendError(res, "Area not found", STATUS_CODES.NOT_FOUND);

        await invalidateAreaCache(id);
        return sendResponse({ res, message: `Area ${is_active ? "activated" : "deactivated"} successfully`, data: area });
    } catch (err) {
        logger.error("[toggleAreaStatus] Error:", err);
        return sendError(res, "Failed to update area status");
    }
};

// DELETE
export const deleteArea = async (req, res) => {
    try {
        const { id } = req.params;
        const area = await ServiceableArea.findByIdAndDelete(id).lean();
        if (!area) return sendError(res, "Area not found", STATUS_CODES.NOT_FOUND);

        await invalidateAreaCache(id);
        return sendResponse({ res, message: "Area deleted successfully" });
    } catch (err) {
        logger.error("[deleteArea] Error:", err);
        return sendError(res, "Failed to delete area");
    }
};

// CHECK SERVICEABILITY — NOT cached (see note below)
export const checkServiceable = async (req, res) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) return sendError(res, "lat & lng required", STATUS_CODES.BAD_REQUEST);

        const areas = await ServiceableArea.find({
            is_active: true,
            location: {
                $near: { $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] }, $maxDistance: 100000 },
            },
        }).lean();

        const match = areas.find((a) =>
            getDistance(Number(lat), Number(lng), a.location.coordinates[1], a.location.coordinates[0]) <= a.service_radius_km
        );

        return sendResponse({ res, data: { serviceable: !!match, area: match || null } });
    } catch (err) {
        logger.error("[checkServiceable] Error:", err);
        return sendError(res, "Serviceability check failed");
    }
};

export const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};