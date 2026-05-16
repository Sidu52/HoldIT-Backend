import ServiceableArea from "../../models/ServiceableArea.js";
import { set, get, del, delByPattern } from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import logger from "../../utils/logger.js";


const LIST_CACHE_TTL = 300;
const DETAIL_CACHE_TTL = 300;

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "city",
  "state",
  "pincode",
  "location",
  "service_radius_km",
  "delivery_charge",
];

// HELPERS
const parseBoolean = (val) => {
  if (val === "true" || val === true) return true;
  if (val === "false" || val === false) return false;
  return undefined;
};

const buildCacheKey = (prefix, params) =>
  `${prefix}:${Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(":")}`;

const invalidateCache = async (id = null) => {
  try {
    const tasks = [delByPattern("areas:*")];
    if (id) tasks.push(del(`area:${id}`));
    await Promise.all(tasks);
  } catch (err) {
    logger.error("Cache invalidation failed", err);
  }
};

// CREATE
export const createArea = async (req, res) => {
  try {
    const area = await ServiceableArea.create({
      ...req.body,
      created_by: req.user?.auth_id,
    });

    await invalidateCache();

    return sendResponse({
      res,
      statusCode: STATUS_CODES.CREATED,
      message: "Area created successfully",
      data: area,
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, "Area already exists in this city", 409);
    }
    logger.error("Create Area Error:", err);
    return sendError(res, "Failed to create area");
  }
};

// GET LIST
export const getAreas = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      city,
      state,
      is_active,
      search,
      sort_by = "createdAt",
      sort_order = "desc",
    } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const filter = { is_deleted: false };

    if (city) filter.city_normalized = city.toLowerCase();
    if (state) filter.state = state;

    const active = parseBoolean(is_active);
    if (active !== undefined) filter.is_active = active;

    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { pincode: new RegExp(search, "i") },
      ];
    }

    const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };

    const cacheKey = buildCacheKey("areas", req.query);

    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Areas fetched",
        data: JSON.parse(cached),
      });
    }

    const skip = (pageNum - 1) * limitNum;
    console.log("filter", filter);
    const [areas, total] = await Promise.all([
      // ServiceableArea.find(filter)
      ServiceableArea.find()
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      // ServiceableArea.countDocuments(filter),
      ServiceableArea.countDocuments(),
    ]);

    console.log("area", areas);

    const result = {
      areas,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      },
    };

    await set(cacheKey, JSON.stringify(result), "EX", LIST_CACHE_TTL);

    return sendResponse({
      res,
      message: "Areas fetched",
      data: result,
    });
  } catch (err) {
    logger.error("Get Areas Error:", err);
    return sendError(res, "Failed to fetch areas");
  }
};

// GET BY ID
export const getAreaById = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `area:${id}`;

    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        data: JSON.parse(cached),
      });
    }

    const area = await ServiceableArea.findOne({
      _id: id,
      // is_deleted: false,
    }).lean();

    if (!area) {
      return sendError(res, "Area not found", 404);
    }

    await set(cacheKey, JSON.stringify(area), "EX", DETAIL_CACHE_TTL);

    return sendResponse({ res, data: area });
  } catch (err) {
    logger.error("Get Area Error:", err);
    return sendError(res, "Failed to fetch area");
  }
};

// UPDATE
export const updateArea = async (req, res) => {
  try {
    const updates = {};

    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (!Object.keys(updates).length) {
      return sendError(res, "No valid fields to update", 400);
    }

    updates.updated_by = req.user?.auth_id;

    const area = await ServiceableArea.findOneAndUpdate(
      { _id: req.params.id, is_deleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!area) {
      return sendError(res, "Area not found", 404);
    }

    await invalidateCache(req.params.id);

    return sendResponse({
      res,
      message: "Updated successfully",
      data: area,
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, "Duplicate area in city", 409);
    }
    logger.error("Update Error:", err);
    return sendError(res, "Update failed");
  }
};

// TOGGLE STATUS
export const toggleAreaStatus = async (req, res) => {
  try {
    const { is_active } = req.body;

    const area = await ServiceableArea.findOneAndUpdate(
      { _id: req.params.id, is_deleted: false },
      {
        $set: {
          is_active,
          updated_by: req.user?.auth_id,
        },
      },
      { new: true }
    ).lean();

    if (!area) {
      return sendError(res, "Area not found", 404);
    }

    await invalidateCache(req.params.id);

    return sendResponse({
      res,
      message: `Area ${is_active ? "activated" : "deactivated"}`,
      data: area,
    });
  } catch (err) {
    logger.error("Toggle Error:", err);
    return sendError(res, "Status update failed");
  }
};

// DELETE
export const deleteArea = async (req, res) => {
  try {
    const area = await ServiceableArea.findOneAndUpdate(
      { _id: req.params.id, is_deleted: false },
      {
        $set: {
          is_deleted: true,
          is_active: false,
          deleted_at: new Date(),
        },
      }
    );

    if (!area) {
      return sendError(res, "Area not found", 404);
    }

    await invalidateCache(req.params.id);

    return sendResponse({
      res,
      message: "Area deleted successfully",
    });
  } catch (err) {
    logger.error("Delete Error:", err);
    return sendError(res, "Delete failed");
  }
};

// CHECK SERVICEABILITY
export const checkServiceable = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return sendError(res, "lat & lng required", 400);
    }

    const areas = await ServiceableArea.find({
      is_active: true,
      is_deleted: false,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
          $maxDistance: 100000,
        },
      },
    }).lean();

    const match = areas.find((a) => {
      const dist = getDistance(
        lat,
        lng,
        a.location.coordinates[1],
        a.location.coordinates[0]
      );
      return dist <= a.service_radius_km;
    });

    return sendResponse({
      res,
      data: {
        serviceable: !!match,
        area: match || null,
      },
    });
  } catch (err) {
    logger.error("Serviceability Error:", err);
    return sendError(res, "Serviceability check failed");
  }
};

// DISTANCE CALCULATION
export const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};