import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../services/redisService.js";
import { JOB_QUEUES, BOOKING_STATUS } from "../utils/constants.js";
import { BOOKING_JOB_NAMES } from "../constants/user/booking.js";
import { scheduleDriverSearch } from "../helpers/user/driverAssignHelper.js";
import Booking from "../models/Booking.js";
import logger from "../utils/logger.js";

let worker;

/**
 * Return Process Worker
 * 
 * Handles the PROCESS_RETURN job dispatched when a user requests their 
 * luggage back. Validates the booking is still in return_requested state
 * and triggers a driver search for the RETURN delivery.
 */
export const createReturnProcessWorker = () => {
    worker = new Worker(
        JOB_QUEUES.RETURN_PROCESS,
        async (job) => {
            const jobName = job.data?.name || job.name;

            switch (jobName) {
                case BOOKING_JOB_NAMES.PROCESS_RETURN:
                    return handleProcessReturn(job);

                case BOOKING_JOB_NAMES.REVERT_IF_NO_DRIVER:
                    return handleRevertIfNoDriver(job);

                default:
                    logger.warn(`[ReturnProcess] Unknown job: ${jobName}`);
                    return { success: false, reason: "unknown_job" };
            }
        },
        {
            connection: sharedWorkerConnection,
            concurrency: 5,
            settings: { lockDuration: 60000 },
        }
    );

    worker.on("error", (err) => {
        logger.error(`[ReturnProcess] Worker error: ${err.message}`);
    });

    worker.on("completed", (job, result) => {
        if (result?.searchScheduled) {
            logger.info(
                `[ReturnProcess] Driver search scheduled for return: ${result.bookingId}`
            );
        }
    });

    worker.on("failed", (job, err) => {
        logger.error(
            `[ReturnProcess] Job ${job.name} failed for ${job.data?.data?.bookingId}: ${err.message} (attempt ${job.attemptsMade})`
        );
    });

    return worker;
};

/**
 * Handle PROCESS_RETURN job:
 * 1. Verify booking exists and is in RETURN_REQUESTED status
 * 2. Verify delivery location is set
 * 3. Schedule a driver search for RETURN type
 */
async function handleProcessReturn(job) {
    const { bookingId } = job.data?.data || job.data;

    if (!bookingId) {
        return { success: false, reason: "missing_booking_id" };
    }

    logger.info(`[ReturnProcess] Processing return for booking: ${bookingId}`);

    const booking = await Booking.findById(bookingId)
        .select("status deliveryLocation storeId userId")
        .lean();

    if (!booking) {
        logger.warn(`[ReturnProcess] Booking ${bookingId} not found`);
        return { success: false, reason: "booking_not_found" };
    }

    if (booking.status !== BOOKING_STATUS.RETURN_REQUESTED) {
        logger.info(
            `[ReturnProcess] Booking ${bookingId} is "${booking.status}", not return_requested. Skipping.`
        );
        return { success: false, reason: "invalid_status" };
    }

    if (!booking.deliveryLocation?.lat || !booking.deliveryLocation?.lng) {
        logger.error(`[ReturnProcess] Booking ${bookingId} has no delivery location set`);
        return { success: false, reason: "no_delivery_location" };
    }

    // Schedule driver search for RETURN delivery
    await scheduleDriverSearch(bookingId, "RETURN");

    logger.info(`[ReturnProcess] ✅ Driver search scheduled for return delivery: ${bookingId}`);

    return {
        success: true,
        searchScheduled: true,
        bookingId,
    };
}

/**
 * Fires NO_DRIVER_TIMEOUT_MS after a return was requested.
 * If the booking is STILL sitting in RETURN_REQUESTED (meaning no driver
 * ever accepted the assignment), revert it to STORED so the user can retry.
 * If a driver already accepted, status will have moved to
 * RETURN_DRIVER_ASSIGNED and this becomes a safe no-op.
 */
async function handleRevertIfNoDriver(job) {
    const { bookingId } = job.data?.data || job.data;
    if (!bookingId) return { success: false, reason: "missing_booking_id" };

    const reverted = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.RETURN_REQUESTED, // only if still stuck here
        },
        {
            $set: {
                status: BOOKING_STATUS.STORED,
                lastStatusUpdatedAt: new Date(),
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.STORED,
                    note: "No driver accepted the return request in time — reverted, user can retry.",
                    updatedByModel: "Admin", // system-driven, no user/driver actor
                    createdAt: new Date(),
                },
            },
        },
        { returnDocument: "after" }
    ).select("_id userId storeId").lean();

    if (!reverted) {
        // Either a driver already accepted (status moved on) or booking is gone — no-op
        logger.info(`[ReturnProcess] Revert-check skipped for ${bookingId} — no longer in RETURN_REQUESTED`);
        return { success: true, reverted: false };
    }

    logger.warn(`[ReturnProcess] ⚠️ Reverted ${bookingId} to STORED — no driver found in time`);

    await invalidateBookingCache(reverted.userId.toString(), bookingId).catch(() => {});

    try {
        const io = safeGetIO();
        if (io) {
            emitBookingReturnNoDriverFound(io, bookingId, reverted.userId.toString());
        }
    } catch (socketErr) {
        logger.debug(`[ReturnProcess:Socket] Emission skipped: ${socketErr.message}`);
    }

    return { success: true, reverted: true, bookingId };
}

export const getWorker = () => worker;
