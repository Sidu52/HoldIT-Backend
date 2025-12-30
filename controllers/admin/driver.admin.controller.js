import Driver from "../../models/Driver.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";

export const getDrivers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            isAvailable,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        // filter
        const filter = {};
        if (status) filter.status = status;
        if (isAvailable !== undefined) {
            filter.is_available = isAvailable === "true";
        }

        // Cache key
        const cacheKey = `drivers:${JSON.stringify({
            page,
            limit,
            status,
            isAvailable,
        })}`;

        // Redis cache check
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Drivers fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // DB query
        const [drivers, total] = await Promise.all([
            Driver.find(filter)
                .select("-__v -password_hash")
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Driver.countDocuments(filter),
        ]);

        const responseData = {
            drivers,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
        };

        // Store in Redis (short TTL)
        await set(cacheKey, JSON.stringify(responseData), "EX", 120); // 2 minutes

        sendResponse({
            res,
            message: "Drivers fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Drivers Error:", err);
        sendError(res, "Failed to fetch drivers");
    }
};
