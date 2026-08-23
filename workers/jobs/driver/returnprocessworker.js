import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../../../services/redisService.js";
import { JOB_QUEUES, BOOKING_STATUS } from "../../../utils/constants.js";
import logger from "../../../utils/logger.js";
import { BOOKING_JOB_NAMES } from "../../../constants/user/booking.js";
import { scheduleDriverSearch } from "../../../helpers/user/driverAssignHelper.js";
import { invalidateBookingCache } from "../../../helpers/user/bookingHelper.js";
import Booking from "../../../models/Booking.js";
import { getIO } from "../../../src/socket/index.js";

let worker;

// Safely get the Socket.IO instance; returns null if not initialized. 
const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};

// Return Process Worker
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
 * Verify booking exists and is eligible (FINAL_PAYMENT_CAPTURED — set by
 *    assignDriverToBooking right before this job is scheduled)
 * Verify delivery location is set
 * Schedule a driver search for RETURN type
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

    if (!booking.deliveryLocation?.lat || !booking.deliveryLocation?.lng) {
        logger.error(`[ReturnProcess] Booking ${bookingId} has no delivery location set`);
        return { success: false, reason: "no_delivery_location" };
    }

    // Allow both FINAL_PAYMENT_CAPTURED and RETURN_REQUESTED 
    if (![BOOKING_STATUS.FINAL_PAYMENT_CAPTURED, BOOKING_STATUS.RETURN_REQUESTED].includes(booking.status)) {
        logger.info(
            `[ReturnProcess] Booking ${bookingId} is "${booking.status}", not eligible. Skipping.`
        );
        return { success: false, reason: "invalid_status" };
    }

    // Schedule driver search for RETURN delivery
    await scheduleDriverSearch(bookingId, "RETURN");

    logger.info(`[ReturnProcess] Driver search scheduled for return delivery: ${bookingId}`);

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

    const bookingDoc = await Booking.findById(bookingId).select("status").lean();
    if (!bookingDoc || ![BOOKING_STATUS.RETURN_REQUESTED, BOOKING_STATUS.FINAL_PAYMENT_CAPTURED].includes(bookingDoc.status)) {
        logger.info(`[ReturnProcess] Revert-check skipped for ${bookingId} — status is "${bookingDoc?.status}"`);
        return { success: true, reverted: false };
    }

    const updated = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: { $in: [BOOKING_STATUS.RETURN_REQUESTED, BOOKING_STATUS.FINAL_PAYMENT_CAPTURED] },
        },
        {
            $set: {
                status: BOOKING_STATUS.FINAL_PAYMENT_CAPTURED,
                lastStatusUpdatedAt: new Date(),
                "delivery.driverSearchStatus": "failed",
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.FINAL_PAYMENT_CAPTURED,
                    note: "No driver accepted the return request in time. You can retry requesting return.",
                    updatedByModel: "Admin",
                    createdAt: new Date(),
                },
            },
        },
        { new: true }
    ).select("_id userId storeId").lean();

    if (!updated) {
        return { success: true, reverted: false };
    }

    logger.warn(`[ReturnProcess] ⚠️ Driver search timed out for return booking ${bookingId} — staying at FINAL_PAYMENT_CAPTURED for user retry`);

    await invalidateBookingCache(updated.userId.toString(), bookingId).catch(() => {});

    try {
        const io = safeGetIO();
        if (io) {
            const { emitBookingReturnNoDriverFound } = await import("../../../src/socket/emitters/booking.emitter.js");
            emitBookingReturnNoDriverFound(io, bookingId, updated.userId.toString());
        }
    } catch (socketErr) {
        logger.debug(`[ReturnProcess:Socket] Emission skipped: ${socketErr.message}`);
    }

    return { success: true, reverted: false, bookingId };
}

export const getWorker = () => worker;