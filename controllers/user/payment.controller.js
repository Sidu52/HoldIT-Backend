import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import { v4 as uuidv4 } from "uuid";
import asyncHandler from "express-async-handler";
import logger from "../../utils/logger.js";
import { invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import { getIO } from "../../src/socket/index.js";

/**
 * @desc Dummy Payment Checkout
 * @route POST /api/v1/user/payment/checkout
 * @access Private (User)
 */
export const dummyCheckout = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;
    const { bookingId, paymentMethod = "dummy_card" } = req.body;

    if (!bookingId) {
        return sendError(res, "Booking ID is required", STATUS_CODES.BAD_REQUEST);
    }

    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }

    if (booking.payment.status === "paid") {
        return sendError(res, "Booking is already paid", STATUS_CODES.BAD_REQUEST);
    }

    // Simulate Payment Processing
    const transactionId = `DUMMY_TXN_${uuidv4().replace(/-/g, "").toUpperCase()}`;
    
    booking.payment.status = "paid";
    booking.payment.transactionId = transactionId;
    booking.payment.method = paymentMethod;
    booking.payment.paidAt = new Date();

    await booking.save();

    // Invalidate Cache
    await invalidateBookingCache(userId, bookingId);

    // Socket Notification
    try {
        const io = getIO();
        io.to(`user:${userId}`).emit("PAYMENT_SUCCESS", {
            bookingId,
            transactionId,
            amount: booking.pricing?.totalAmount || 0
        });
    } catch (err) {
        logger.warn(`[Payment:Socket] Emission failed for user ${userId}: ${err.message}`);
    }

    return sendResponse({
        res,
        message: "Payment successful (Dummy)",
        data: {
            bookingId: booking._id,
            transactionId,
            status: booking.payment.status
        }
    });
});
