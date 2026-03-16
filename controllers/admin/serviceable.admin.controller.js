import ServiceableArea from "../../models/ServiceableArea.js";
import {
  set,
  get,
  del,
  delByPattern,
} from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { ACCOUNT_STATUS, STATUS_CODES } from "../../utils/constants.js";

// Cache TTLs and constants
const LIST_CACHE_TTL = 300; // 5 minutes
const DETAIL_CACHE_TTL = 300; // 5 minutes
const EXCLUDED_FIELDS = "-__v";

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "city",
  "state",
  "pincode",
  "location",
  "service_radius_km",
  "delivery_charge",
];

// Helper: Escape Regex
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Invalidate Cache
const invalidateAreaCache = async (areaId = null) => {
  try {
    const promises = [delByPattern("serviceable_areas:*")];
    if (areaId) {
      promises.push(del(`serviceable_area:${areaId}`));
    }
    await Promise.all(promises);
  } catch (err) {
    console.error("Cache invalidation error:", err);
  }
};

// Build Cache Key
const buildCacheKey = (prefix, params) => {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`);

  return `${prefix}:${parts.join(":")}`;
};

// CREATE SERVICEABLE AREA
export const createServiceableArea = async (req, res) => {
  try {
    const {
      name,
      city,
      state,
      pincode,
      location,
      service_radius_km,
      delivery_charge,
    } = req.body;

    // Check for duplicate area name in same city
    const existing = await ServiceableArea.findOne({
      name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
      city: { $regex: `^${escapeRegex(city.trim())}$`, $options: "i" },
      is_deleted: { $ne: true },
    }).lean();

    if (existing) {
      return sendError(
        res,
        `Serviceable area "${name}" already exists in ${city}`,
        STATUS_CODES.CONFLICT
      );
    }

    const area = await ServiceableArea.create({
      name: name.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode,
      location,
      service_radius_km,
      delivery_charge,
      created_by: req.user.auth_id,
    });

    // Invalidate list caches
    await invalidateAreaCache();

    return sendResponse({
      res,
      statusCode: STATUS_CODES.CREATED,
      message: "Serviceable area created successfully",
      data: area,
    });
  } catch (error) {
    console.error("Create Serviceable Area Error:", error);
    return sendError(res, "Failed to create serviceable area");
  }
};

// GET SERVICEABLE AREAS (Paginated)
export const getServiceableAreas = async (req, res) => {
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
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = { is_deleted: { $ne: true } };

    if (city) {
      filter.city = { $regex: `^${escapeRegex(city.trim())}$`, $options: "i" };
    }

    if (state) {
      filter.state = { $regex: `^${escapeRegex(state.trim())}$`, $options: "i" };
    }

    if (is_active !== undefined) {
      filter.is_active = is_active;
    }

    if (search) {
      const escapedSearch = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { city: { $regex: escapedSearch, $options: "i" } },
        { pincode: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // Build sort
    const sortDirection = sort_order === "asc" ? 1 : -1;
    const sort = { [sort_by]: sortDirection };

    // Cache key
    const cacheKey = buildCacheKey("serviceable_areas", {
      page: pageNum,
      limit: limitNum,
      city,
      state,
      is_active,
      search,
      sort_by,
      sort_order,
    });

    // Check cache
    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Serviceable areas fetched successfully",
        data: JSON.parse(cached),
      });
    }

    // Execute queries in parallel
    const [areas, total] = await Promise.all([
      ServiceableArea.find(filter)
        .select(EXCLUDED_FIELDS)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ServiceableArea.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    const responseData = {
      areas,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    };

    // Cache result
    await set(
      cacheKey,
      JSON.stringify(responseData),
      "EX",
      LIST_CACHE_TTL
    );

    return sendResponse({
      res,
      message: "Serviceable areas fetched successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Get Serviceable Areas Error:", error);
    return sendError(res, "Failed to fetch serviceable areas");
  }
};

// GET SERVICEABLE AREA BY ID
export const getServiceableAreaById = async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `serviceable_area:${id}`;

    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Serviceable area fetched successfully",
        data: JSON.parse(cached),
      });
    }

    const area = await ServiceableArea.findOne({
      _id: id,
      is_deleted: { $ne: true },
    })
      .select(EXCLUDED_FIELDS)
      .lean();

    if (!area) {
      return sendError(
        res,
        "Serviceable area not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    await set(
      cacheKey,
      JSON.stringify(area),
      "EX",
      DETAIL_CACHE_TTL
    );

    return sendResponse({
      res,
      message: "Serviceable area fetched successfully",
      data: area,
    });
  } catch (error) {
    console.error("Get Serviceable Area Error:", error);
    return sendError(res, "Failed to fetch serviceable area");
  }
};

// UPDATE SERVICEABLE AREA
export const updateServiceableArea = async (req, res) => {
  try {
    const { id } = req.params;
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

    // Add audit fields
    updates.updated_by = req.user.auth_id;
    updates.updated_at = new Date();

    // If name or city is changing, check for duplicates
    if (updates.name || updates.city) {
      const current = await ServiceableArea.findById(id)
        .select("name city")
        .lean();

      if (current) {
        const checkName = updates.name || current.name;
        const checkCity = updates.city || current.city;

        const duplicate = await ServiceableArea.findOne({
          _id: { $ne: id },
          name: {
            $regex: `^${escapeRegex(checkName.trim())}$`,
            $options: "i",
          },
          city: {
            $regex: `^${escapeRegex(checkCity.trim())}$`,
            $options: "i",
          },
          is_deleted: { $ne: true },
        }).lean();

        if (duplicate) {
          return sendError(
            res,
            `Serviceable area "${checkName}" already exists in ${checkCity}`,
            STATUS_CODES.CONFLICT
          );
        }
      }
    }

    const area = await ServiceableArea.findOneAndUpdate(
      { _id: id, is_deleted: { $ne: true } },
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select(EXCLUDED_FIELDS)
      .lean();

    if (!area) {
      return sendError(
        res,
        "Serviceable area not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    // Invalidate caches
    await invalidateAreaCache(id);

    return sendResponse({
      res,
      message: "Serviceable area updated successfully",
      data: area,
    });
  } catch (error) {
    console.error("Update Serviceable Area Error:", error);
    return sendError(res, "Failed to update serviceable area");
  }
};

// TOGGLE STATUS
export const toggleServiceableAreaStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const area = await ServiceableArea.findOne({
      _id: id,
      is_deleted: { $ne: true },
    })
      .select("is_active name")
      .lean();

    if (!area) {
      return sendError(
        res,
        "Serviceable area not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    if (area.is_active === is_active) {
      return sendError(
        res,
        `Area is already ${is_active ?  ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.INACTIVE}`,
        STATUS_CODES.CONFLICT
      );
    }

    const updatedArea = await ServiceableArea.findByIdAndUpdate(
      id,
      {
        $set: {
          is_active,
          status_updated_by: req.user.auth_id,
          status_updated_at: new Date(),
        },
      },
      { new: true }
    )
      .select(EXCLUDED_FIELDS)
      .lean();

    // Invalidate caches
    await invalidateAreaCache(id);

    return sendResponse({
      res,
      message: `Serviceable area ${is_active ? "activated" : "deactivated"} successfully`,
      data: updatedArea,
    });
  } catch (error) {
    console.error("Toggle Status Error:", error);
    return sendError(res, "Failed to update status");
  }
};

// SOFT DELETE
export const deleteServiceableArea = async (req, res) => {
  try {
    const { id } = req.params;

    const area = await ServiceableArea.findOne({
      _id: id,
      is_deleted: { $ne: true },
    })
      .select("_id name")
      .lean();

    if (!area) {
      return sendError(
        res,
        "Serviceable area not found",
        STATUS_CODES.NOT_FOUND
      );
    }

    await ServiceableArea.findByIdAndUpdate(id, {
      $set: {
        is_deleted: true,
        is_active: false,
        deleted_by: req.user.auth_id,
        deleted_at: new Date(),
      },
    });

    // Invalidate caches
    await invalidateAreaCache(id);

    return sendResponse({
      res,
      message: "Serviceable area deleted successfully",
    });
  } catch (error) {
    console.error("Delete Serviceable Area Error:", error);
    return sendError(res, "Failed to delete serviceable area");
  }
};