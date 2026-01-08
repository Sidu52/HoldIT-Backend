import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";

// Get Bookings
export const getBookings = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            userId,
        } = req.query;

        const skip = (page - 1) * limit;
        const filter = {};
        if (status) filter.status = status;
        if (userId) filter.user_id = userId;

        const cacheKey = `bookings:${JSON.stringify({ page, limit, status, userId })}`;

        // Redis cache check
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Bookings fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // DB query
        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select("-__v")
                .sort({ created_at: -1 })
                .skip(Number(skip))
                .limit(Number(limit))
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const responseData = {
            bookings,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: Number(limit),
            },
        };

        // Store in Redis
        await set(cacheKey, JSON.stringify(responseData), "EX", 120); // 2 minutes

        sendResponse({
            res,
            message: "Bookings fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Bookings Error:", err);
        sendError(res, "Failed to fetch bookings");
    }
};
