import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";

export const getStores = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      city,
      isActive,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // filter
    const filter = {};
    if (status) filter.status = status;
    if (city) filter.city = city;
    if (isActive !== undefined) {
      filter.store_is_active = isActive === "true";
    }

    // Cache key
    const cacheKey = `stores:${JSON.stringify({
      page,
      limit,
      status,
      city,
      isActive,
    })}`;

    // Redis cache
    const cached = await get(cacheKey);
    if (cached) {
      return sendResponse({
        res,
        message: "Stores fetched successfully",
        data: JSON.parse(cached),
      });
    }

    // DB query
    const [stores, total] = await Promise.all([
      Store.find(filter)
        .select("-__v")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Store.countDocuments(filter),
    ]);

    const responseData = {
      stores,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    // Cache (short TTL)
    await set(cacheKey, JSON.stringify(responseData), "EX", 120);

    sendResponse({
      res,
      message: "Stores fetched successfully",
      data: responseData,
    });
  } catch (err) {
    console.error("Get Stores Error:", err);
    sendError(res, "Failed to fetch stores");
  }
};
