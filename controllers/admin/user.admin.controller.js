import User from "../../models/User.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";

export const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            phone,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        // filter
        const filter = {};
        if (status) filter.status = status;
        if (phone) filter.phone = phone;

        // Cache key
        const cacheKey = `users:${JSON.stringify({
            page,
            limit,
            status,
            phone,
        })}`;

        // Redis cache check
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Users fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // DB query
        const [users, total] = await Promise.all([
            User.find(filter)
                .select("-__v -password -otp -refreshToken") // protect PII
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            User.countDocuments(filter),
        ]);

        const responseData = {
            users,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
        };

        // Cache with SHORT TTL
        await set(cacheKey, JSON.stringify(responseData), "EX", 120); // ⏱ 2 minutes

        sendResponse({
            res,
            message: "Users fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Users Error:", err);
        sendError(res, "Failed to fetch users");
    }
};
