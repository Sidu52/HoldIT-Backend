import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import { invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import { timingSafeEqual } from "../../helpers/user/authHelper.js";
import logger from "../../utils/logger.js";

const buildPagination = (page, limit, total) => ({
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
});

// GET INCOMING
export const getIncomingBookings = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const bookings = await Booking.find({
            storeId: new mongoose.Types.ObjectId(storeId),
            status: BOOKING_STATUS.STORE_ASSIGNED,
            isActive: true,
        })
            .select("bookingCode status pickupLocation luggage pickup storage pricing userId createdAt")
            .populate("userId", "first_name last_name phone")
            .sort({ createdAt: 1 })
            .lean();

        return sendResponse({
            res,
            message: "Incoming bookings fetched successfully.",
            data: { bookings, total: bookings.length },
        });
    } catch (err) {
        logger.error("Store Get Incoming Error:", err);
        return sendError(res, "Failed to fetch incoming bookings.");
    }
};

// GET ACTIVE
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
        logger.error("Store Get Active Error:", err);
        return sendError(res, "Failed to fetch active bookings.");
    }
};

// GET BOOKING DETAIL
export const getBookingDetail = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
        })
            .select("-__v")
            .populate("userId", "first_name last_name phone")
            .populate("storeId", "store_name store_contact_number location")
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
        logger.error("Store Get Booking Detail Error:", err);
        return sendError(res, "Failed to fetch booking.");
    }
};

// CONFIRM STORED
export const confirmStored = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;
        const { notes = "" } = req.body;

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
        })
            .select("status userId storage")
            .lean();

        if (!booking) {
            return sendError(res, "Booking not found.", STATUS_CODES.NOT_FOUND);
        }

        if (booking.status !== BOOKING_STATUS.STORE_ASSIGNED) {
            return sendError(
                res,
                `Cannot confirm storage — booking is currently "${booking.status}". Driver must arrive at store first.`,
                STATUS_CODES.CONFLICT
            );
        }

        const now = new Date();

        const updated = await Booking.findByIdAndUpdate(
            booking_id,
            {
                $set: {
                    status: BOOKING_STATUS.STORED,
                    "storage.storedAt": now,
                    "storage.notes": notes,
                    lastStatusUpdatedAt: now,
                },
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.STORED,
                        note: notes || "Luggage confirmed as stored by store",
                        updatedBy: new mongoose.Types.ObjectId(storeId),
                        updatedByModel: "Store",
                        createdAt: now,
                    },
                },
            },
            { new: true }
        ).select("_id bookingCode status storage userId");

        await invalidateBookingCache(
            updated.userId.toString(),
            booking_id
        ).catch(() => { });

        return sendResponse({
            res,
            message: "Luggage confirmed as stored successfully.",
            data: {
                bookingId: updated._id,
                bookingCode: updated.bookingCode,
                status: updated.status,
                storedAt: updated.storage?.storedAt,
            },
        });
    } catch (err) {
        logger.error("Store Confirm Stored Error:", err);
        return sendError(res, "Failed to confirm storage.");
    }
};

// GET HISTORY
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
        logger.error("Store Get History Error:", err);
        return sendError(res, "Failed to fetch booking history.");
    }
};

// VERIFY RETURN OTP
export const verifyReturnOtp = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;
        const { otp } = req.body;

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        if (!otp) {
            return sendError(res, "OTP is required.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
            status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
        })
            .select("delivery userId")
            .lean();

        if (!booking) {
            return sendError(
                res,
                "Booking not found or not ready for return handover.",
                STATUS_CODES.NOT_FOUND
            );
        }

        // OTP is stored on booking.delivery.returnOtp when return driver is assigned
        const isValid =
            booking.delivery?.returnOtp &&
            booking.delivery.returnOtp.length === otp.toString().length &&
            timingSafeEqual(booking.delivery.returnOtp, otp.toString());

        if (!isValid) {
            return sendError(res, "Invalid or expired OTP.", STATUS_CODES.BAD_REQUEST);
        }

        const now = new Date();

        const updated = await Booking.findByIdAndUpdate(
            booking_id,
            {
                $set: {
                    "storage.releasedAt": now,
                    "delivery.returnOtp": null,
                    lastStatusUpdatedAt: now,
                },
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                        note: "Luggage handed over to return driver by store",
                        updatedBy: new mongoose.Types.ObjectId(storeId),
                        updatedByModel: "Store",
                        createdAt: now,
                    },
                },
            },
            { new: true }
        ).select("_id userId storage");

        await invalidateBookingCache(
            updated.userId.toString(),
            booking_id
        ).catch(() => { });

        return sendResponse({
            res,
            message: "Luggage handed over to return driver successfully.",
            data: {
                bookingId: updated._id,
                releasedAt: updated.storage?.releasedAt,
            },
        });
    } catch (err) {
        logger.error("Store Verify Return OTP Error:", err);
        return sendError(res, "Failed to verify return OTP.");
    }
};