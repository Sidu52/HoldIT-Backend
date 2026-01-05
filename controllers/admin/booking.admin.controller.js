import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";

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
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
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

// Create Booking
export const createBooking = async (req, res) => {
    try {
        const { userId, booking } = req.body;

        if (!userId) {
            return sendError(res, "User ID is required", 400);
        }

        if (!booking || typeof booking !== "object") {
            return sendError(res, "Valid booking data is required", 400);
        }

        // Build booking payload safely
        const bookingData = {
            user_id: userId,
            ...booking,
        };

        const bookingDoc = await Booking.create(bookingData);

        sendResponse({
            res,
            message: "Booking created successfully",
            data: bookingDoc,
        });

    } catch (err) {
        console.error("Create Booking Error:", err);

        if (err.name === "ValidationError") {
            return sendError(res, err.message, 400);
        }

        sendError(res, "Failed to create booking");
    }
};

// Delete Booking
export const deleteBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        if (!bookingId) {
            return sendError(res, "Booking ID is required", 400);
        }

        const booking = await Booking.findByIdAndDelete(bookingId);

        if (!booking) {
            return sendError(res, "Booking not found", 404);
        }

        sendResponse({
            res,
            message: "Booking deleted successfully",
            data: booking,
        });

    } catch (err) {
        console.error("Delete Booking Error:", err);
        sendError(res, "Failed to delete booking");
    }
};


// Update Booking
export const updateBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { status } = req.body;

        if (!bookingId) {
            return sendError(res, "Booking ID is required", 400);
        }

        if (!status) {
            return sendError(res, "Status is required", 400);
        }

        const booking = await Booking.findByIdAndUpdate(
            bookingId,
            { $set: { status } },
            {
                new: true,
                runValidators: true
            }
        );

        if (!booking) {
            return sendError(res, "Booking not found", 404);
        }

        sendResponse({
            res,
            message: "Booking updated successfully",
            data: booking,
        });

    } catch (err) {
        console.error("Update Booking Error:", err);
        sendError(res, "Failed to update booking");
    }
};
