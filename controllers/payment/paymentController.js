import crypto from "crypto";
import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Payment, { PAYMENT_STATUS, PAYMENT_TYPE } from "../../models/Payment.js";
import { razorpay } from "../../config/razorpay.js";
import logger from "../../utils/logger.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { addJobToQueue } from "../../services/jobService.js";
import { PAYMENT_FOLLOWUP_QUEUE, PAYMENT_FOLLOWUP_JOB_NAMES, AUTO_CANCEL_REASONS } from "../../constants/user/booking.js";
import { autoCancelBooking, invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import { assignDriverToBooking, assignStoreDriverToBooking } from "../../helpers/user/bookingHelper.js";
import { scheduleDriverSearch } from "../../helpers/driver/driver.js";

export const getPaymentByBookingId = async (req, res) => {
    try {
        const bookingId = req.params.bookingId;
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        const payment = await Payment.findOne({ bookingId });
        if (!payment) {
            return sendError(res, "Payment not found", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Payment fetched successfully",
            data: payment,
        });
    } catch (err) {
        logger.error("[getPaymentByBookingId] Error:", err);
        return sendError(res, "Failed to fetch payment");
    }
};

export const verifyPayment = async (req, res) => {
    const session = await mongoose.startSession();
   
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return sendError(res, "Missing payment verification fields", STATUS_CODES.BAD_REQUEST);
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            logger.warn(`[verifyPayment] Signature mismatch for order ${razorpay_order_id}`);
            return sendError(res, "Payment verification failed", STATUS_CODES.FORBIDDEN);
        }

        session.startTransaction();

        const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id }).session(session);
        if (!payment) {
            await session.abortTransaction();
            return sendError(res, "Payment record not found", STATUS_CODES.NOT_FOUND);
        }

        // Idempotent: if the webhook already marked this captured, don't redo work
        if (payment.status !== PAYMENT_STATUS.CAPTURED) {
            payment.razorpayPaymentId = razorpay_payment_id;
            payment.razorpaySignature = razorpay_signature;
            payment.status = PAYMENT_STATUS.CAPTURED;
            payment.capturedAt = new Date();
            await payment.save({ session });

            await Booking.updateOne(
                { _id: payment.bookingId },
                {
                    $set: { "payment.paidAt": new Date(), "payment.paymentId": payment._id },
                    $push: {
                        timeline: {
                            status: "PAYMENT_COMPLETED",
                            note: "Payment verified via checkout callback",
                            updatedByModel: "User",
                        },
                    },
                },
                { session }
            );
        }

        await session.commitTransaction();
        session.endSession();

        // Invalidate Redis cache immediately post-payment
        if (payment.userId) {
            await invalidateBookingCache(payment.userId.toString(), payment.bookingId.toString()).catch(() => {});
        }

        // Dispatch store & driver assignment post-commit
        if (payment.type === PAYMENT_TYPE.ADVANCE) {
            await assignStoreDriverToBooking({ bookingId: payment.bookingId.toString(), paymentId: payment._id.toString() })
                .catch((err) => logger.error(`[verifyPayment] Store/Driver assignment failed:`, err));
            import("../../services/fundDistributionService.js")
                .then(({ processAdvancePaymentDistribution }) => processAdvancePaymentDistribution(payment._id))
                .catch((distErr) => logger.error(`[verifyPayment] Advance distribution error:`, distErr));
        } else {
            await assignDriverToBooking({ bookingId: payment.bookingId.toString(), paymentId: payment._id.toString() })
                .catch((err) => logger.error(`[verifyPayment] Driver assignment failed:`, err));
            import("../../services/fundDistributionService.js")
                .then(({ processFinalPaymentDistribution }) => processFinalPaymentDistribution(payment._id))
                .catch((distErr) => logger.error(`[verifyPayment] Final distribution error:`, distErr));
        }

        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: "Payment verified",
            data: { bookingId: payment.bookingId, status: payment.status },
        });
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction().catch(() => { });
        }
        session.endSession();
        logger.error("[verifyPayment] Failed:", err);
        return sendError(res, "Payment verification failed", STATUS_CODES.INTERNAL_SERVER_ERROR);
    }
};

import WebhookEvent from "../../models/WebhookEvent.js";

export const razorpayWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
        const rawBody = req.body;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest("hex");

        if (expectedSignature !== signature) {
            logger.warn("[razorpayWebhook] Invalid signature");
            return res.status(STATUS_CODES.BAD_REQUEST).json({ ok: false });
        }

        const event = JSON.parse(rawBody.toString());
        const eventId = event.event_id || event.id || `${event.event}_${Date.now()}`;
        const eventType = event.event;
        const entity = event.payload?.payment?.entity;

        if (!entity) return res.status(STATUS_CODES.SUCCESS).json({ ok: true });

        // Idempotency check via WebhookEvent model
        try {
            const existingEvent = await WebhookEvent.findOne({ provider: "RAZORPAY", eventId });
            if (existingEvent && existingEvent.status === "PROCESSED") {
                logger.info(`[razorpayWebhook] Event ${eventId} already processed — returning success.`);
                return res.status(STATUS_CODES.SUCCESS).json({ ok: true });
            }
        } catch (evtErr) {
            logger.warn(`[razorpayWebhook] WebhookEvent lookup warning: ${evtErr.message}`);
        }

        const webhookRecord = await WebhookEvent.findOneAndUpdate(
            { provider: "RAZORPAY", eventId },
            {
                $set: {
                    eventType,
                    status: "RECEIVED",
                    processedAt: new Date(),
                },
            },
            { upsert: true, new: true }
        );

        if (eventType === "payment.captured") {
            const payment = await Payment.findOneAndUpdate(
                { razorpayOrderId: entity.order_id, status: { $ne: PAYMENT_STATUS.CAPTURED } },
                {
                    $set: {
                        razorpayPaymentId: entity.id,
                        status: PAYMENT_STATUS.CAPTURED,
                        method: entity.method,
                        capturedAt: new Date(),
                    },
                    $push: { webhookEvents: { event: eventType } },
                },
                { new: true }
            );

            if (payment) {
                if (payment.userId) {
                    await invalidateBookingCache(payment.userId.toString(), payment.bookingId.toString()).catch(() => {});
                }

                if (payment.type === PAYMENT_TYPE.ADVANCE) {
                    await assignStoreDriverToBooking({ bookingId: payment.bookingId.toString(), paymentId: payment._id.toString() });
                    import("../../services/fundDistributionService.js")
                        .then(({ processAdvancePaymentDistribution }) => processAdvancePaymentDistribution(payment._id))
                        .catch((distErr) => logger.error(`[Webhook] Advance distribution error for payment ${payment._id}:`, distErr));
                } else {
                    await assignDriverToBooking({ bookingId: payment.bookingId.toString(), paymentId: payment._id.toString() });
                    import("../../services/fundDistributionService.js")
                        .then(({ processFinalPaymentDistribution }) => processFinalPaymentDistribution(payment._id))
                        .catch((distErr) => logger.error(`[Webhook] Final distribution error for payment ${payment._id}:`, distErr));
                }
            }
        } else if (eventType === "payment.failed") {
            const failedPayment = await Payment.findOneAndUpdate(
                { razorpayOrderId: entity.order_id },
                {
                    $set: { status: PAYMENT_STATUS.FAILED, failureReason: entity.error_description || "Unknown failure" },
                    $push: { webhookEvents: { event: eventType } },
                },
                { new: true }
            );
            if (failedPayment?.bookingId) {
                await autoCancelBooking(
                    failedPayment.bookingId,
                    `Payment failed: ${entity.error_description || "Payment captured/auth failed"}`
                );
            }
        } else if (eventType === "refund.processed") {
            const refundEntity = event.payload?.refund?.entity;
            await Payment.findOneAndUpdate(
                { razorpayPaymentId: refundEntity.payment_id },
                [
                    {
                        $set: {
                            amountRefundedMinor: { $add: ["$amountRefundedMinor", refundEntity.amount] },
                            amountRefunded: { $divide: [{ $add: ["$amountRefundedMinor", refundEntity.amount] }, 100] },
                            refundedAt: new Date(),
                            status: {
                                $cond: [
                                    { $gte: [{ $add: ["$amountRefundedMinor", refundEntity.amount] }, "$amountMinor"] },
                                    PAYMENT_STATUS.REFUNDED,
                                    PAYMENT_STATUS.PARTIALLY_REFUNDED,
                                ],
                            },
                        },
                    },
                ]
            );
        }

        if (webhookRecord) {
            webhookRecord.status = "PROCESSED";
            await webhookRecord.save().catch(() => {});
        }

        return res.status(STATUS_CODES.SUCCESS).json({ ok: true });
    } catch (err) {
        logger.error("[razorpayWebhook] Failed:", err);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ ok: false });
    }
};