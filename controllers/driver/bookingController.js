
import { acceptBookingOffer, rejectBookingOffer, getDriverActiveBooking } from "../../helpers/driver/bookingHelper.js";
import { sendResponse,sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";

// ─── ACCEPT BOOKING ───────────────────────────────────────────────────────────

export const acceptBooking = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { bookingId } = req.params;

        if (!bookingId) {
            return sendError(res, "Booking ID is required", STATUS_CODES.BAD_REQUEST);
        }

        const result = await acceptBookingOffer(bookingId, driverId);

        if (!result.success) {
            const errorMap = {
                OFFER_NOT_FOUND: { msg: "No active offer found for this booking", code: STATUS_CODES.NOT_FOUND },
                OFFER_NOT_FOR_YOU: { msg: "This offer was not assigned to you", code: STATUS_CODES.FORBIDDEN },
                OFFER_EXPIRED: { msg: "This offer has expired", code: STATUS_CODES.CONFLICT },
                ALREADY_ACCEPTED: { msg: "This booking has already been accepted", code: STATUS_CODES.CONFLICT },
                BOOKING_NOT_FOUND: { msg: "Booking not found", code: STATUS_CODES.NOT_FOUND },
                BOOKING_CANCELLED: { msg: "This booking has been cancelled", code: STATUS_CODES.CONFLICT },
                ALREADY_ASSIGNED: { msg: "A driver has already been assigned", code: STATUS_CODES.CONFLICT },
                DRIVER_ALREADY_SET: { msg: "A driver has already been assigned", code: STATUS_CODES.CONFLICT },
                BOOKING_TAKEN: { msg: "This booking was just taken by another driver", code: STATUS_CODES.CONFLICT },
            };

            const { msg, code } = errorMap[result.reason] ?? {
                msg: "Failed to accept booking",
                code: STATUS_CODES.INTERNAL_SERVER_ERROR,
            };

            return sendError(res, msg, code);
        }

        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: "Booking accepted successfully",
            data: {
                bookingId: result.booking._id,
                bookingCode: result.booking.bookingCode,
                status: result.booking.status,
                pickup: {
                    scheduledAt: result.booking.pickup?.scheduledAt,
                    location: result.booking.pickupLocation,
                },
            },
        });
    } catch (err) {
        console.error("[Driver] acceptBooking error:", err.message);
        return sendError(res, "Failed to accept booking");
    }
};

// ─── REJECT BOOKING ───────────────────────────────────────────────────────────

export const rejectBooking = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { bookingId } = req.params;
        const { reason } = req.body;

        if (!bookingId) {
            return sendError(res, "Booking ID is required", STATUS_CODES.BAD_REQUEST);
        }

        const result = await rejectBookingOffer(bookingId, driverId, reason);

        if (!result.success) {
            const errorMap = {
                OFFER_NOT_FOUND: { msg: "No active offer found", code: STATUS_CODES.NOT_FOUND },
                OFFER_NOT_FOR_YOU: { msg: "This offer was not assigned to you", code: STATUS_CODES.FORBIDDEN },
                OFFER_EXPIRED: { msg: "Offer has already expired", code: STATUS_CODES.CONFLICT },
                ALREADY_ACCEPTED: { msg: "Booking already accepted", code: STATUS_CODES.CONFLICT },
            };

            const { msg, code } = errorMap[result.reason] ?? {
                msg: "Failed to reject booking",
                code: STATUS_CODES.INTERNAL_SERVER_ERROR,
            };

            return sendError(res, msg, code);
        }

        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: "Booking rejected",
            data: null,
        });
    } catch (err) {
        console.error("[Driver] rejectBooking error:", err.message);
        return sendError(res, "Failed to reject booking");
    }
};

// ─── GET ACTIVE BOOKING ───────────────────────────────────────────────────────

export const getActiveBooking = async (req, res) => {
    try {
        const driverId = req.user.auth_id;

        const booking = await getDriverActiveBooking(driverId);

        if (!booking) {
            return sendResponse({
                res,
                statusCode: STATUS_CODES.SUCCESS,
                message: "No active booking",
                data: null,
            });
        }

        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: "Active booking fetched",
            data: booking,
        });
    } catch (err) {
        console.error("[Driver] getActiveBooking error:", err.message);
        return sendError(res, "Failed to fetch active booking");
    }
};