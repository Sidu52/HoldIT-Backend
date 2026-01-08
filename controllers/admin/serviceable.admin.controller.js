import ServiceableArea from "../../models/ServiceableArea.js";
import { set, get, del } from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";

export const createServiceableArea = async (req, res) => {
  try {
    const {
      name,
      city,
      state,
      pincode,
      location,
      service_radius_km = 5,
      delivery_charge = 0,
    } = req.body;

    if (!name || !city || !state || !location?.coordinates) {
      return sendError(
        res,
        "Required fields are missing",
        STATUS_CODES.BAD_REQUEST
      );
    }

    const area = await ServiceableArea.create({
      name,
      city,
      state,
      pincode,
      location,
      service_radius_km,
      delivery_charge,
      created_by: req.user._id,
    });

    // Clear cached lists
    await del("serviceable_areas:list");

    return sendResponse(
      res,
      area,
      "Serviceable area created successfully",
      STATUS_CODES.CREATED
    );
  } catch (error) {
    console.error("Create Serviceable Area Error:", error);
    return sendError(res, "Failed to create serviceable area");
  }
};


export const getServiceableAreas = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      city,
      state,
      is_active,
      search,
    } = req.query;

    const cacheKey = `serviceable_areas:list:${JSON.stringify(req.query)}`;

    // Try cache first
    const cachedData = await get(cacheKey);
    if (cachedData) {
      return sendResponse(res, JSON.parse(cachedData), "Fetched from cache");
    }

    const matchStage = {};

    if (city) matchStage.city = city;
    if (state) matchStage.state = state;
    if (is_active !== undefined)
      matchStage.is_active = is_active === "true";

    if (search) {
      matchStage.$or = [
        { name: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { pincode: { $regex: search, $options: "i" } },
      ];
    }

    const aggregation = [
      { $match: matchStage },
      {
        $facet: {
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: Number(limit) },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await ServiceableArea.aggregate(aggregation);

    const response = {
      data: result[0].data,
       pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(
          (result[0].totalCount[0]?.count || 0) / limit),
                totalItems:  result[0].totalCount[0]?.count || 0,
                itemsPerPage: Number(limit),
            },
    };

    // Cache response
    await set(cacheKey, JSON.stringify(response), 300); // 5 min

    return sendResponse(res, response, "Serviceable areas fetched successfully");
  } catch (error) {
    console.error("Get Serviceable Areas Error:", error);
    return sendError(res, "Failed to fetch serviceable areas");
  }
};


export const getServiceableAreaById = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `serviceable_area:${id}`;

    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse(res, JSON.parse(cached), "Fetched from cache");
    }

    const area = await ServiceableArea.findById(id);
    if (!area) {
      return sendError(res, "Serviceable area not found", STATUS_CODES.NOT_FOUND);
    }

    await set(cacheKey, JSON.stringify(area), 300);

    return sendResponse(res, area, "Serviceable area fetched successfully");
  } catch (error) {
    console.error("Get Serviceable Area Error:", error);
    return sendError(res, "Failed to fetch serviceable area");
  }
};

export const updateServiceableArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, city, state, pincode, location, service_radius_km, delivery_charge } = req.body;

    const area = await ServiceableArea.findByIdAndUpdate(
      id,
      { $set: { name, city, state, pincode, location, service_radius_km, delivery_charge } },
      { new: true }
    );

    if (!area) {
      return sendError(res, "Serviceable area not found", STATUS_CODES.NOT_FOUND);
    }

    // Clear caches
    await del(`serviceable_area:${id}`);
    await del("serviceable_areas:list");

    return sendResponse(
      res,
      area,
      "Serviceable area updated successfully"
    );
  } catch (error) {
    console.error("Update Serviceable Area Error:", error);
    return sendError(res, "Failed to update serviceable area");
  }
};

export const toggleServiceableAreaStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const area = await ServiceableArea.findById(id);
    if (!area) {
      return sendError(res, "Serviceable area not found", STATUS_CODES.NOT_FOUND);
    }

    area.is_active = !area.is_active;
    await area.save();

    await del(`serviceable_area:${id}`);
    await del("serviceable_areas:list");

    return sendResponse(
      res,
      area,
      `Serviceable area ${area.is_active ? "activated" : "deactivated"}`
    );
  } catch (error) {
    console.error("Toggle Status Error:", error);
    return sendError(res, "Failed to update status");
  }
};

export const deleteServiceableArea = async (req, res) => {
  try {
    const { id } = req.params;

    const area = await ServiceableArea.findByIdAndUpdate(id, { is_active: false });
    if (!area) {
      return sendError(res, "Serviceable area not found", STATUS_CODES.NOT_FOUND);
    }

    await del(`serviceable_area:${id}`);
    await del("serviceable_areas:list");

    return sendResponse(res, null, "Serviceable area deleted successfully");
  } catch (error) {
    console.error("Delete Serviceable Area Error:", error);
    return sendError(res, "Failed to delete serviceable area");
  }
};

