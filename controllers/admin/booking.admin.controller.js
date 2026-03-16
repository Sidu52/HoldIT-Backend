import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";

// CONSTANTS
const LIST_CACHE_TTL = 120; // 2 minutes
const DETAIL_CACHE_TTL = 300; // 5 minutes
const EXCLUDED_FIELDS = "-__v";

// Build Cache Key
const buildCacheKey = (prefix, params) => {
    const parts = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`);

    return `${prefix}:${parts.join(":")}`;
};

// Escape Regex
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET BOOKINGS (Paginated + Filtered)
export const getBookings = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            user_id,
            search,
            sort_by = "created_at",
            sort_order = "desc",
            from_date,
            to_date,
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter = {};

        if (status) {
            filter.status = status;
        }

        if (user_id) {
            filter.user_id = user_id;
        }

        if (search) {
            const escapedSearch = escapeRegex(search.trim());
            filter.$or = [
                { booking_id: { $regex: escapedSearch, $options: "i" } },
                { "customer.name": { $regex: escapedSearch, $options: "i" } },
                { "customer.email": { $regex: escapedSearch, $options: "i" } },
                { "customer.phone": { $regex: escapedSearch, $options: "i" } },
            ];
        }

        // Date range filter
        if (from_date || to_date) {
            filter.created_at = {};
            if (from_date) {
                filter.created_at.$gte = new Date(from_date);
            }
            if (to_date) {
                const endDate = new Date(to_date);
                endDate.setHours(23, 59, 59, 999);
                filter.created_at.$lte = endDate;
            }
        }

        // Build sort
        const sortDirection = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDirection };

        // Cache key
        const cacheKey = buildCacheKey("bookings", {
            page: pageNum,
            limit: limitNum,
            status,
            user_id,
            search,
            sort_by,
            sort_order,
            from_date,
            to_date,
        });

        // Check cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Bookings fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Execute queries in parallel
        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select(EXCLUDED_FIELDS)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);

        const responseData = {
            bookings,
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
        await set(cacheKey, JSON.stringify(responseData), "EX", LIST_CACHE_TTL);

        return sendResponse({
            res,
            message: "Bookings fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Bookings Error:", err);
        return sendError(res, "Failed to fetch bookings");
    }
};

// GET BOOKING BY ID
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = `booking:${id}`;

        // Check cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Booking fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const booking = await Booking.findById(id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!booking) {
            return sendError(
                res,
                "Booking not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Cache result
        await set(cacheKey, JSON.stringify(booking), "EX", DETAIL_CACHE_TTL);

        return sendResponse({
            res,
            message: "Booking fetched successfully",
            data: booking,
        });
    } catch (err) {
        console.error("Get Booking By ID Error:", err);
        return sendError(res, "Failed to fetch booking");
    }
};

// UPDATE BOOKING STATUS
export const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        const { auth_id, role } = req.user;
        // Fetch current booking
        const booking = await Booking.findById(id)
            .select("status")
            .lean();

        if (!booking) {
            return sendError(
                res,
                "Booking not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Prevent setting same status
        if (booking.status === status) {
            return sendError(
                res,
                `Booking is already ${status}`,
                STATUS_CODES.CONFLICT
            );
        }

        // Validate status transition
        const validTransition = isValidStatusTransition(
            booking.status,
            status
        );
        if (!validTransition) {
            return sendError(
                res,
                `Cannot transition from "${booking.status}" to "${status}"`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Build update
        const updateData = {
            status,
            updated_at: new Date(),
            status_updated_by: auth_id,
        };

        if (status === BOOKING_STATUS.CANCELLED && reason) {
            updateData.cancellation_reason = reason;
            updateData.cancelled_at = new Date();
            updateData.cancelled_by = auth_id;
        }

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Invalidate caches
        await Promise.all([
            del(`booking:${id}`),
            delByPattern("bookings:*"),
        ]);

        return sendResponse({
            res,
            message: `Booking status updated to ${status}`,
            data: updatedBooking,
        });
    } catch (err) {
        console.error("Update Booking Status Error:", err);
        return sendError(res, "Failed to update booking status");
    }
};

// Validate Status Transitions
const VALID_TRANSITIONS = {
    [BOOKING_STATUS.CREATED]: [
        BOOKING_STATUS.STORE_ASSIGNED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.STORE_ASSIGNED]: [
       BOOKING_STATUS.DRIVER_ASSIGNED,,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.DRIVER_ASSIGNED]: [
        BOOKING_STATUS.DRIVER_ARRIVED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.DRIVER_ARRIVED]: [
        BOOKING_STATUS.PICKED_UP,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.PICKED_UP]: [
        BOOKING_STATUS.STORED,
    ],
    [BOOKING_STATUS.STORED]: [
        BOOKING_STATUS.RETURN_REQUESTED,
    ],
    [BOOKING_STATUS.RETURN_REQUESTED]: [
        BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.RETURN_DRIVER_ASSIGNED]: [
        BOOKING_STATUS.DELIVERED,
    ],
    [BOOKING_STATUS.DELIVERED]: [],    // Terminal state
    [BOOKING_STATUS.CANCELLED]: [],    // Terminal state
};

const isValidStatusTransition = (currentStatus, newStatus) => {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) return false;
    return allowed.includes(newStatus);
};