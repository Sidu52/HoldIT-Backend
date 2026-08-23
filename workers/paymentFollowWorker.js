import mongoose from "mongoose";
import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../services/redisService.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import {
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    PAYMENT_FOLLOWUP_QUEUE,
    AUTO_CANCEL_REASONS,
    BOOKING_JOB_NAMES,
} from "../constants/user/booking.js";
import { findNearestAvailableStore, assignStoreToBooking, createTimelineEntry, queueBookingJob, invalidateBookingCache } from "../helpers/user/bookingHelper.js";
import { generateInvoiceForPayment } from "../helpers/user/invoiceHelper.js";
import { triggerAutoRefund } from "../helpers/payment/paymentHelper.js";
import { addJobToQueue } from "../services/jobService.js";
import { getIO } from "../src/socket/index.js";
import { emitBookingStoreAssigned, emitStoreIncomingBooking } from "../src/socket/emitters/booking.emitter.js";
import logger from "../utils/logger.js";
import { BOOKING_STATUS, JOB_QUEUES } from "../utils/constants.js";

const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};

let worker;

const JOB_HANDLERS = {
    [JOB_QUEUES.ASSIGN_STORE_AND_DISPATCH]: handleAssignStoreAndDispatch,
    [JOB_QUEUES.DISPATCH_RETURN_DRIVER]: handleDispatchReturnDriver,
};

export const createPaymentFollowupWorker = () => {
    worker = new Worker(
        PAYMENT_FOLLOWUP_QUEUE,
        async (job) => {
            const handler = JOB_HANDLERS[job.name];
            if (!handler) {
                logger.warn(`[PaymentFollowup] Unknown job: ${job.name}`);
                return { success: false, reason: "unknown_job" };
            }
            return handler(job);
        },
        {
            connection: sharedWorkerConnection,
            concurrency: 10,
            settings: { lockDuration: 60000 },
        }
    );

    worker.on("error", (err) => {
        logger.error(`[PaymentFollowup] Worker error: ${err.message}`);
    });

    worker.on("completed", (job, result) => {
        logger.info(`[PaymentFollowup] ${job.name} completed for booking ${job.data?.bookingId}:`, result);
    });

    worker.on("failed", async (job, err) => {
        const bookingId = job?.data?.bookingId;
        const paymentId = job?.data?.paymentId;
        const attemptsMade = job?.attemptsMade ?? 0;
        const maxAttempts = job?.opts?.attempts ?? 1;

        logger.error(
            `[PaymentFollowup] Job ${job?.name} failed for booking ${bookingId}: ${err.message} (attempt ${attemptsMade}/${maxAttempts})`
        );

        if (!bookingId || attemptsMade < maxAttempts) return;

        logger.error(
            `[PaymentFollowup] Job for ${bookingId} exhausted all retries after payment capture — refunding + cancelling.`
        );
        try {
            await Booking.updateOne(
                { _id: bookingId, isActive: true },
                {
                    $set: {
                        status: BOOKING_STATUS.CANCELLED,
                        cancelledBy: "SYSTEM",
                        cancelReason: AUTO_CANCEL_REASONS.POST_PAYMENT_PROCESSING_FAILED ?? "Post-payment processing failed",
                    },
                }
            );
            if (paymentId) await triggerAutoRefund(paymentId);
        } catch (cleanupErr) {
            logger.error(`[PaymentFollowup] Cleanup after final failure also failed for ${bookingId}:`, cleanupErr.message);
        }
    });

    return worker;
};

// Job Handler Functions
async function handleAssignStoreAndDispatch(job) {
    const { bookingId, paymentId } = job.data;
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const booking = await Booking.findById(bookingId).session(session);
        if (!booking || booking.status !== BOOKING_STATUS.PAYMENT_PENDING) {
            await session.abortTransaction();
            return { success: false, reason: "already_processed_or_invalid_state" };
        }

        const { store, error } = await findNearestAvailableStore(
            booking.pickupLocation.lat, booking.pickupLocation.lng, session
        );
        if (!store) {
            logger.error(`[PaymentFollowup] No store for booking ${bookingId}: ${error}`);
            booking.status = BOOKING_STATUS.CANCELLED;
            booking.cancelledBy = "SYSTEM";
            booking.cancelReason = "No store capacity after payment";
            booking.timeline.push(
                createTimelineEntry(BOOKING_STATUS.CANCELLED, "Auto-cancelled: no store capacity after payment", null, null)
            );
            await booking.save({ session });
            await session.commitTransaction();
            session.endSession();

            await triggerAutoRefund(paymentId);
            return { success: false, reason: "no_store_capacity" };
        }

        await assignStoreToBooking(store._id, session);
        booking.storeId = store._id;
        booking.status = BOOKING_STATUS.STORE_ASSIGNED;
        booking.timeline.push(
            createTimelineEntry(BOOKING_STATUS.STORE_ASSIGNED, `Store assigned: ${store.store_name}`, null, null)
        );
        await booking.save({ session });

        await session.commitTransaction();
        session.endSession();

        await addJobToQueue(
            DRIVER_ASSIGN_QUEUE,
            {
                name: DRIVER_JOB_NAMES.SEARCH_DRIVERS,
                data: { bookingId, lat: booking.pickupLocation.lat, lng: booking.pickupLocation.lng, type: "PICKUP" },
            },
            { jobId: `search-drivers-pickup-${bookingId}`, delay: 2000, removeOnComplete: true, removeOnFail: { count: 50 } }
        );

        await generateInvoiceForPayment(paymentId);

        const io = safeGetIO();
        if (io) {
            emitBookingStoreAssigned(io, bookingId, booking.userId.toString(), store);
            emitStoreIncomingBooking(io, bookingId, store._id.toString(), { bookingCode: booking.bookingCode });
        }

        return { success: true, bookingId, storeId: store._id.toString() };
    } catch (err) {
        await session.abortTransaction().catch(() => { });
        logger.error(`[PaymentFollowup] assign-store-and-dispatch failed for ${bookingId}:`, err);
        throw err;
    } finally {
        session.endSession();
    }
}

async function handleDispatchReturnDriver(job) {
    const { bookingId, paymentId } = job.data;
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const now = new Date();
        const booking = await Booking.findOne({
            _id: bookingId,
            status: { $in: [BOOKING_STATUS.FINAL_PAYMENT_PENDING, BOOKING_STATUS.FINAL_PAYMENT_CAPTURED] },
        }).session(session);

        if (!booking) {
            await session.abortTransaction();
            return { success: false, reason: "already_processed_or_invalid_state" };
        }

        if (booking.status === BOOKING_STATUS.FINAL_PAYMENT_PENDING) {

            // Update booking state, delivery metrics, and append timeline entry
            booking.status = BOOKING_STATUS.FINAL_PAYMENT_CAPTURED;
            booking.lastStatusUpdatedAt = now;
            booking.timeline.push(
                createTimelineEntry(
                    BOOKING_STATUS.FINAL_PAYMENT_CAPTURED,
                    "Final payment captured —  search for return driver",
                    null,
                    null
                )
            );
            await booking.save({ session });

            await session.commitTransaction();
            session.endSession();
        } else {
            // Already at FINAL_PAYMENT_CAPTURED nothing to update, just close the transaction
            await session.commitTransaction();
            session.endSession();
        }

        // Perform async side tasks concurrently following the processReturnBooking pattern
        const { cleanupBookingRedisKeys } = await import("../helpers/user/driverAssignHelper.js");

        const tasks = [
            { label: "cleanupRedisKeys", promise: cleanupBookingRedisKeys(bookingId) },
            {
                label: "queueReturnJob",
                promise: queueBookingJob(
                    JOB_QUEUES.RETURN_PROCESS,
                    BOOKING_JOB_NAMES.PROCESS_RETURN,
                    { bookingId }
                ),
            },
            {
                label: "queueNoDriverRevertCheck",
                promise: queueBookingJob(
                    JOB_QUEUES.RETURN_PROCESS,
                    BOOKING_JOB_NAMES.REVERT_IF_NO_DRIVER,
                    { bookingId },
                    {
                        jobId: `revert-return-${bookingId}`,
                        delay: 2000,
                    }
                ),
            },

            {
                label: "generateInvoice",
                promise: generateInvoiceForPayment(paymentId),
            },
            { label: "invalidateCache", promise: invalidateBookingCache(booking.userId.toString(), bookingId) },
        ];

        const results = await Promise.allSettled(tasks.map((t) => t.promise));

        results.forEach((result, i) => {
            if (result.status === "rejected") {
                logger.error(
                    `[handleDispatchReturnDriver] Post-commit task '${tasks[i].label}' failed for booking ${bookingId}:`,
                    result.reason?.message ?? result.reason
                );
            }
        });

        return { success: true, bookingId };
    } catch (err) {
        await session.abortTransaction().catch(() => { });
        logger.error(`[PaymentFollowup] dispatch-return-driver failed for ${bookingId}:`, err);
        throw err;
    } finally {
        session.endSession();
    }
}

export const getPaymentFollowupWorker = () => worker;