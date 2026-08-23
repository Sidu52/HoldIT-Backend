import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../services/redisService.js";
import { JOB_QUEUES } from "../utils/constants.js";
import Booking from "../models/Booking.js";
import logger from "../utils/logger.js";

let worker;

export const createBookingCancelledWorker = () => {
    worker = new Worker(
        JOB_QUEUES.BOOKING_CANCELLED,
        async (job) => {
            try {
                const { bookingId } = job.data;
                logger.info(`[Booking Cancelled Worker] Processing cancellation for booking: ${bookingId}`);

                const booking = await Booking.findById(bookingId).select("payment.status pricing userId").lean();
                if (!booking) return { success: false, reason: "not_found" };

                // Process Mock Refund
                if (booking.payment?.status === "paid") {
                    logger.info(`[Booking Cancelled Worker] Processing refund for booking ${bookingId}`);
                    // Mock payment gateway refund logic
                    await Booking.findByIdAndUpdate(bookingId, {
                        $set: {
                            "payment.status": "refunded",
                            "payment.refundedAt": new Date(),
                            "payment.refundAmount": booking.pricing?.totalAmount || 0
                        }
                    });
                }

                // Notify User
                logger.info(`[Booking Cancelled Worker] Successfully processed cancellation effects for ${bookingId}`);

                return { success: true, bookingId };
            } catch (err) {
                logger.error(`[Booking Cancelled Worker] Error processing ${job.id}:`, err);
                throw err;
            }
        },
        {
            connection: sharedWorkerConnection,
            concurrency: 5,
        }
    );

    worker.on("error", (err) => {
        logger.error("[Booking Cancelled Worker] Worker error:", err.message);
    });

    worker.on("failed", (job, err) => {
        logger.error(`[Booking Cancelled Worker] Job ${job.id} failed:`, err.message);
    });

    return worker;
};

export const getBookingCancelledWorker = () => worker;
