import { registerWorker } from "../../services/jobService.js";
import {
    processDriverSearch,
    processAcceptanceTimeout,
} from "./driverSearchJob.js";
import { BOOKING_JOB_NAMES } from "../../constants/booking.js";
import logger from "../../utils/logger.js";


export const initializeJobProcessors = () => {
    // Handles both search rounds AND acceptance timeouts
    registerWorker("driver-search", async (job) => {
        const jobName = job.data.name;

        switch (jobName) {
            case BOOKING_JOB_NAMES.FIND_DRIVER:
                await processDriverSearch(job);
                break;

            case BOOKING_JOB_NAMES.DRIVER_SEARCH_TIMEOUT:
                await processAcceptanceTimeout(job);
                break;

            default:
                logger.warn(`[Jobs] Unknown driver-search job: ${jobName}`);
        }
    });

    // Driver Notification Queue
    registerWorker("driver-notification", async (job) => {
        const {
            driverId,
            bookingId,
            distanceKm,
            expiresInSeconds,
        } = job.data.data;

        logger.info(
            `[Notification] Sending to driver ${driverId} ` +
            `for booking ${bookingId} (${distanceKm}km away, ` +
            `expires in ${expiresInSeconds}s)`
        );

        // Push notification integration
        // await pushNotificationService.send(driverId, {
        //     title: "New Pickup Request!",
        //     body: `Pickup ${distanceKm}km away. Tap to accept.`,
        //     data: {
        //         bookingId,
        //         type: "NEW_PICKUP_REQUEST",
        //         expiresAt: Date.now() + expiresInSeconds * 1000,
        //     },
        // });
    });

    // Booking Cancelled Queue
    registerWorker("booking-cancelled", async (job) => {
        const { bookingId, userId, reason, cancelledBy, type } = job.data.data;

        logger.info(
            `[Cancelled] Booking ${bookingId} cancelled by ${cancelledBy}: ${reason}`
        );

        // Send notification to user
        // if (type === "AUTO_CANCEL_NO_DRIVER") {
        //     await pushNotificationService.send(userId, {
        //         title: "Booking Cancelled",
        //         body: "Sorry, no driver was available. Your booking has been cancelled.",
        //     });
        // }
    });

    registerWorker("refund-process", async (job) => {
        const { bookingId, userId, amount, transactionId, reason } = job.data.data;

        logger.info(
            `[Refund] Processing refund of ${amount} for booking ${bookingId}`
        );

        // TODO: Payment gateway refund integration
        // await paymentService.refund(transactionId, amount, reason);

        // Update booking payment status
        // await Booking.findByIdAndUpdate(bookingId, {
        //     "payment.status": "REFUNDED",
        //     "payment.refundedAt": new Date(),
        //     "payment.refundAmount": amount,
        // });
    });

    logger.info("[Jobs] All job processors initialized");
};