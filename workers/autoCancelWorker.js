import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../services/redisService.js";
import { del } from "../services/redisService.js";
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

                // Guard: If booking has already progressed, do not cancel
                const skipStatuses = [
                    BOOKING_STATUS.DRIVER_ARRIVED,
                    BOOKING_STATUS.PICKED_UP,
                    BOOKING_STATUS.STORED,
                    BOOKING_STATUS.DELIVERED,
                    BOOKING_STATUS.CANCELLED,
                ];

                if (skipStatuses.includes(booking.status)) {
                    logger.info(`[Auto Cancel] Booking ${bookingId} is ${booking.status}, skipping.`);
                    return { success: false, reason: "already_progressed" };
                }

                // Special Guard: If DRIVER_ASSIGNED, verify they haven't accepted yet
                if (booking.status === BOOKING_STATUS.DRIVER_ASSIGNED) {
                    const acceptKeyPickup = `booking:accept:${bookingId}:pickup`;
                    const acceptKeyDelivery = `booking:accept:${bookingId}:delivery`;

                    const [pendingPickup, pendingDelivery] = await Promise.all([
                        import("../services/redisService.js").then(m => m.get(acceptKeyPickup)),
                        import("../services/redisService.js").then(m => m.get(acceptKeyDelivery))
                    ]);

                    if (!pendingPickup && !pendingDelivery) {
                        logger.info(`[Auto Cancel] Driver has already accepted ${bookingId}, skipping.`);
                        return { success: false, reason: "driver_accepted" };
                    }
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
                    del(`booking:accept:${bookingId}:pickup`),
                    del(`booking:accept:${bookingId}:delivery`),
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