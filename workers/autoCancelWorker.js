import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../services/redisService.js";
import { cancelJob } from "../services/jobService.js";
import Booking from "../models/Booking.js";
import { BOOKING_STATUS, JOB_QUEUES } from "../utils/constants.js";
import logger from "../utils/logger.js";

let worker;

export const createAutoCancelWorker = () => {
    worker = new Worker(
        JOB_QUEUES.BOOKING_AUTO_CANCEL,
        async (job) => {
            try {
                const { bookingId, reason } = job.data;

                logger.info(`[Auto Cancel] Checking booking: ${bookingId}`);

                // Check current state from DB
                const booking = await Booking.findById(bookingId)
                    .select("status storeId userId")
                    .lean();

                if (!booking) {
                    return { success: false, reason: "not_found" };
                }

                // GOnly cancel if booking is still in a pending/pre-driver-assigned state
                const pendingStatuses = [
                    BOOKING_STATUS.CREATED,
                    BOOKING_STATUS.PAYMENT_PENDING,
                    BOOKING_STATUS.STORE_ASSIGNED,
                ];

                if (!pendingStatuses.includes(booking.status)) {
                    logger.info(`[Auto Cancel] Booking ${bookingId} status is '${booking.status}' (already progressed/paid), skipping auto-cancel.`);
                    return { success: false, reason: "already_progressed" };
                }

                // EXECUTE UNIFIED CANCELLATION
                const { autoCancelBooking } = await import("../helpers/user/bookingHelper.js");
                const result = await autoCancelBooking(bookingId, reason || "No driver available within time limit");

                if (!result.success) {
                    return { success: false, reason: "helper_failed" };
                }

                // Clean up worker-specific jobs/keys
                await Promise.allSettled([
                    cancelJob("driver-assign", `driver-pickup-${bookingId}`),
                    cancelJob("driver-assign", `check-accept-${bookingId}-pickup`),
                    cancelJob("driver-assign", `check-accept-${bookingId}-delivery`),
                ]);

                return { success: true, bookingId };
            } catch (err) {
                logger.error(`[Auto Cancel] Error processing ${job.id}:`, err);
                throw err;
            }
        },
        {
            connection: sharedWorkerConnection,
            concurrency: 5,
        }
    );

    worker.on("error", (err) => {
        logger.error("[Auto Cancel] Worker error:", err.message);
    });

    worker.on("failed", (job, err) => {
        logger.error(`[Auto Cancel] Job ${job.id} failed:`, err.message);
    });

    return worker;
};

export const getWorker = () => worker;