import mongoose from "mongoose";
import { acceptBookingOffer, rejectBookingOffer, getDriverActiveBooking } from "../../helpers/driver/driverBookingHelper.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { buildPagination } from "../../utils/helper.js";

const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id) &&
        new mongoose.Types.ObjectId(id).toString() === id;
};

const BOOKING_ERROR_MAP = {
    OFFER_NOT_FOUND: {
        msg: "No active offer found for this booking",
        code: STATUS_CODES.NOT_FOUND
    },
    OFFER_NOT_FOR_YOU: {
        msg: "This offer was not assigned to you",
        code: STATUS_CODES.FORBIDDEN
    },
    OFFER_EXPIRED: {
        msg: "This offer has expired",
        code: STATUS_CODES.CONFLICT
    },
    ALREADY_ACCEPTED: {
        msg: "This booking has already been accepted",
        code: STATUS_CODES.CONFLICT
    },

    BOOKING_NOT_FOUND: {
        msg: "Booking not found",
        code: STATUS_CODES.NOT_FOUND
    },
    BOOKING_CANCELLED: {
        msg: "This booking has been cancelled",
        code: STATUS_CODES.CONFLICT
    },
    ALREADY_ASSIGNED: {
        msg: "A driver has already been assigned to this booking",
        code: STATUS_CODES.CONFLICT
    },
    DRIVER_ALREADY_SET: {
        msg: "A driver has already been assigned to this booking",
        code: STATUS_CODES.CONFLICT
    },
    BOOKING_TAKEN: {
        msg: "This booking was just taken by another driver",
        code: STATUS_CODES.CONFLICT
    },

    DRIVER_NOT_AVAILABLE: {
        msg: "You are not available to accept bookings",
        code: STATUS_CODES.CONFLICT
    },
    DRIVER_ON_TRIP: {
        msg: "You already have an active trip",
        code: STATUS_CODES.CONFLICT
    },
};

const getErrorResponse = (reason, defaultMsg = "Operation failed") => {
    return BOOKING_ERROR_MAP[reason] ?? {
        msg: defaultMsg,
        code: STATUS_CODES.INTERNAL_SERVER_ERROR,
    };
};


export const acceptBooking = asyncHandler(async (req, res) => {
    const driverId = req.user?.auth_id;
    const { bookingId } = req.params;
    if (!driverId) {
        return sendError(
            res,
            "Authentication required",
            STATUS_CODES.UNAUTHORIZED
        );
    }
    if (!bookingId) {
        return sendError(
            res,
            "Booking ID is required",
            STATUS_CODES.BAD_REQUEST
        );
    }

    if (!isValidObjectId(bookingId)) {
        return sendError(
            res,
            "Invalid booking ID format",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const result = await acceptBookingOffer(bookingId, driverId);

    if (!result.success) {
        const { msg, code } = getErrorResponse(
            result.reason,
            "Failed to accept booking"
        );

        logger.warn(`[Driver] Booking accept failed - Driver: ${driverId}, Booking: ${bookingId}, Reason: ${result.reason}`);

        return sendError(res, msg, code);
    }

    logger.info(`[Driver] Booking accepted - Driver: ${driverId}, Booking: ${bookingId}`);

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Booking accepted successfully",
        data: {
            bookingId: result.booking._id,
            bookingCode: result.booking.bookingCode,
            status: result.booking.status,
            pickup: {
                scheduledAt: result.booking.pickup?.scheduledAt ?? null,
                location: result.booking.pickupLocation ?? null,
            },
            // Include additional useful data
            dropoff: {
                location: result.booking.dropLocation ?? null,
            },
            user: result.booking.user ? {
                _id: result.booking.user._id,
                name: result.booking.user.first_name,
                phone: result.booking.user.phone,
            } : null,
        },
    });
});


// REJECT BOOKING
export const rejectBooking = asyncHandler(async (req, res) => {
    const driverId = req.user?.auth_id;
    const { bookingId } = req.params;
    const { reason } = req.body;
    if (!driverId) {
        return sendError(
            res,
            "Authentication required",
            STATUS_CODES.UNAUTHORIZED
        );
    }
    if (!bookingId) {
        return sendError(
            res,
            "Booking ID is required",
            STATUS_CODES.BAD_REQUEST
        );
    }

    if (!isValidObjectId(bookingId)) {
        return sendError(
            res,
            "Invalid booking ID format",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const sanitizedReason = reason?.trim()?.substring(0, 500) || null;

    const result = await rejectBookingOffer(bookingId, driverId, sanitizedReason);

    if (!result.success) {
        const { msg, code } = getErrorResponse(
            result.reason,
            "Failed to reject booking"
        );

        logger.warn(`[Driver] Booking reject failed - Driver: ${driverId}, Booking: ${bookingId}, Reason: ${result.reason}`);

        return sendError(res, msg, code);
    }

    logger.info(`[Driver] Booking rejected - Driver: ${driverId}, Booking: ${bookingId}, Reason: ${sanitizedReason || 'Not provided'}`);

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Booking rejected successfully",
        data: {
            bookingId,
            rejected: true,
        },
    });
});


// GET ACTIVE BOOKING 
export const getActiveBooking = asyncHandler(async (req, res) => {
    const driverId = req.user?.auth_id;

    if (!driverId) {
        return sendError(
            res,
            "Authentication required",
            STATUS_CODES.UNAUTHORIZED
        );
    }

    const booking = await getDriverActiveBooking(driverId);

    if (!booking) {
        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: "No active booking found",
            data: {
                hasActiveBooking: false,
                booking: null,
            },
        });
    }

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Active booking retrieved successfully",
        data: {
            hasActiveBooking: true,
            booking,
        },
    });
});


// GET BOOKING DETAIL
export const getBookingDetails = asyncHandler(async (req, res) => {
    const driverId = req.user?.auth_id;
    const { bookingId } = req.params;

    if (!driverId) {
        return sendError(
            res,
            "Authentication required",
            STATUS_CODES.UNAUTHORIZED
        );
    }

    if (!bookingId) {
        return sendError(
            res,
            "Booking ID is required",
            STATUS_CODES.BAD_REQUEST
        );
    }

    if (!isValidObjectId(bookingId)) {
        return sendError(
            res,
            "Invalid booking ID format",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const Booking = (await import("../../models/Booking.js")).default;

    const booking = await Booking.findOne({
        _id: bookingId,
        driver_id: driverId,
    })
        .populate("user_id", "first_name last_name phone")
        .select("-__v")
        .lean();

    if (!booking) {
        return sendError(
            res,
            "Booking not found or not assigned to you",
            STATUS_CODES.NOT_FOUND
        );
    }

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Booking details retrieved successfully",
        data: { booking },
    });
});


// GET BOOKING HISTORY
export const getBookingHistory = asyncHandler(async (req, res) => {
    const driverId = req.user?.auth_id;
    const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate
    } = req.query;

    if (!driverId) {
        return sendError(
            res,
            "Authentication required",
            STATUS_CODES.UNAUTHORIZED
        );
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = { driver_id: driverId };

    if (status) {
        const validStatuses = ['COMPLETED', 'CANCELLED', 'FAILED'];
        if (validStatuses.includes(status.toUpperCase())) {
            query.status = status.toUpperCase();
        }
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            const start = new Date(startDate);
            if (!isNaN(start.getTime())) {
                query.createdAt.$gte = start;
            }
        }
        if (endDate) {
            const end = new Date(endDate);
            if (!isNaN(end.getTime())) {
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
        if (Object.keys(query.createdAt).length === 0) {
            delete query.createdAt;
        }
    }

    const Booking = (await import("../../models/Booking.js")).default;

    const [bookings, total] = await Promise.all([
        Booking.find(query)
            .populate("user_id", "first_name last_name")
            .select("bookingCode status pickupLocation dropLocation fare createdAt completedAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Booking.countDocuments(query),
    ]);

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Booking history retrieved successfully",
        data: {
            bookings,
            pagination: buildPagination(pageNum, limitNum, total),
        },
    });
});