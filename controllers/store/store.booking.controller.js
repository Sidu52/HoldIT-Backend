import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import { invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import { processMarkStored } from "../../helpers/store/store.helper.js";

// HELPERS
const buildPagination = (page, limit, total) => ({
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
});

// GET INCOMING
// Bookings where driver has arrived at this store with luggage.
// These need the store to physically accept and confirm storage.
export const getIncomingBookings = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const bookings = await Booking.find({
            storeId: new mongoose.Types.ObjectId(storeId),
            status: BOOKING_STATUS.AT_STORE,
            isActive: true,
        })
            .select("bookingCode status pickupLocation luggage pickup storage pricing userId createdAt")
            .populate("userId", "first_name last_name phone")
            .sort({ "pickup.assignment.completedAt": 1 }) // oldest arrival first
            .lean();

        return sendResponse({
            res,
            message: "Incoming bookings fetched successfully.",
            data: { bookings, total: bookings.length },
        });
    } catch (err) {
        console.error("Store Get Incoming Error:", err);
        return sendError(res, "Failed to fetch incoming bookings.");
    }
};

// GET ACTIVE (STORED)
// Luggage currently in storage at this store
export const getActiveBookings = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(50, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {
            storeId: new mongoose.Types.ObjectId(storeId),
            status: BOOKING_STATUS.STORED,
            isActive: true,
        };

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select("bookingCode status pickupLocation luggage storage pricing payment userId createdAt")
                .populate("userId", "first_name last_name phone")
                .sort({ "storage.storedAt": -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        return sendResponse({
            res,
            message: "Active bookings fetched successfully.",
            data: {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            },
        });
    } catch (err) {
        console.error("Store Get Active Error:", err);
        return sendError(res, "Failed to fetch active bookings.");
    }
};

// GET BOOKING DETAIL
export const getBookingDetail = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
        })
            .select("-__v")
            .populate("userId", "first_name last_name phone")
            .populate("storeId", "store_name store_address store_contact_number location")
            .lean();

        if (!booking) {
            return sendError(res, "Booking not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Booking fetched successfully.",
            data: { booking },
        });
    } catch (err) {
        console.error("Store Get Booking Detail Error:", err);
        return sendError(res, "Failed to fetch booking.");
    }
};

// MARK STORED luggage checked into store, driver is now free
export const confirmStored = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;
        const { notes = "" } = req.body;

        const booking = await processMarkStored(booking_id, storeId, notes);

        if (!booking) {
            // Could be wrong storeId, wrong status, or booking doesn't exist
            const existing = await Booking.findById(booking_id)
                .select("status storeId")
                .lean();

            if (!existing) {
                return sendError(res, "Booking not found.", STATUS_CODES.NOT_FOUND);
            }

            if (existing.storeId?.toString() !== storeId) {
                return sendError(res, "This booking is not assigned to your store.", STATUS_CODES.FORBIDDEN);
            }

            return sendError(
                res,
                `Cannot confirm storage — booking is currently in "${existing.status}" status. Driver must arrive at store first.`,
                STATUS_CODES.CONFLICT
            );
        }

        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);
        // Invalidate user-facing booking cache so they see STORED status immediately
        await invalidateBookingCache(
            booking.userId.toString(),
            booking_id
        ).catch(() => { }); // non-fatal

        // TODO: push notification to user
        // "Your luggage is safely stored at [store name]. You can request return any time."

        return sendResponse({
            res,
            message: "Luggage confirmed as stored successfully.",
            data: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: booking.status,
                storedAt: booking.storage?.storedAt,
            },
        });
    } catch (err) {
        console.error("Store Confirm Stored Error:", err);
        return sendError(res, "Failed to confirm storage.");
    }
};

// GET HISTORY 
// Completed and cancelled bookings for this store
export const getBookingHistory = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { page = 1, limit = 20, sort_order = "desc" } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(50, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        const filter = {
            storeId: new mongoose.Types.ObjectId(storeId),
            status: { $in: [BOOKING_STATUS.DELIVERED, BOOKING_STATUS.CANCELLED] },
        };

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select("bookingCode status pickupLocation luggage pricing payment storage createdAt cancelledAt cancelReason")
                .populate("userId", "first_name last_name phone")
                .sort({ createdAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        return sendResponse({
            res,
            message: "Booking history fetched successfully.",
            data: {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            },
        });
    } catch (err) {
        console.error("Store Get History Error:", err);
        return sendError(res, "Failed to fetch booking history.");
    }
};