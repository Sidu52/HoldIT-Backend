import { Worker } from "bullmq";
import { createBullConnection } from "../services/redisService.js";
import { del } from "../services/redisService.js";
import { cancelJob } from "../services/jobService.js";
import Booking from "../models/Booking.js";
import Store from "../models/Store.js";
import { BOOKING_STATUS, JOB_QUEUES } from "../utils/constants.js";

let worker;

export const createAutoCancelWorker = () => {
    worker = new Worker(
        JOB_QUEUES.BOOKING_AUTO_CANCEL,
        async (job) => {
            const { bookingId, reason, cancelledBy } = job.data;

            console.log(`[Auto Cancel] Checking booking: ${bookingId}`);

            // Check if cancellation needed
            const booking = await Booking.findById(bookingId)
                .select("status storeId isActive")
                .lean();

            if (!booking) {
                return { success: false, reason: "not_found" };
            }

            // Already progressed past driver assignment
            const skipStatuses = [
                BOOKING_STATUS.DRIVER_ARRIVED,
                BOOKING_STATUS.PICKED_UP,
                BOOKING_STATUS.STORED,
                BOOKING_STATUS.DELIVERED,
                BOOKING_STATUS.CANCELLED,
            ];

            if (skipStatuses.includes(booking.status)) {
                console.log(`[Auto Cancel] Booking ${bookingId} is ${booking.status}, no action needed`);
                return { success: false, reason: "already_progressed" };
            }

            // Check if driver was accepted (DRIVER_ASSIGNED means accepted)
            if (booking.status === BOOKING_STATUS.DRIVER_ASSIGNED) {
                // Verify driver actually accepted (not just assigned)
                const acceptKeyPickup = `booking:accept:${bookingId}:pickup`;
                const acceptKeyDelivery = `booking:accept:${bookingId}:delivery`;
                const pendingPickup = await import("../services/redisService.js").then(m => m.get(acceptKeyPickup));
                const pendingDelivery = await import("../services/redisService.js").then(m => m.get(acceptKeyDelivery));

                // If no pending acceptance keys, driver has accepted
                if (!pendingPickup && !pendingDelivery) {
                    console.log(`[Auto Cancel] Driver already accepted for ${bookingId}, skipping`);
                    return { success: false, reason: "driver_accepted" };
                }
            }

            // Cancel the booking
            const now = new Date();

            const updated = await Booking.findOneAndUpdate(
                {
                    _id: bookingId,
                    status: {
                        $in: [
                            BOOKING_STATUS.CREATED,
                            BOOKING_STATUS.STORE_ASSIGNED,
                        ],
                    },
                },
                {
                    $set: {
                        status: BOOKING_STATUS.CANCELLED,
                        isActive: false,
                        cancelledAt: now,
                        cancelledBy: cancelledBy || "SYSTEM",
                        cancelReason: reason || "No driver available within time limit",
                        lastStatusUpdatedAt: now,
                    },
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.CANCELLED,
                            note: `Auto-cancelled: ${reason}`,
                            createdAt: now,
                        },
                    },
                },
                { new: true }
            );

            if (!updated) {
                console.log(`[Auto Cancel] Could not cancel ${bookingId} (status changed)`);
                return { success: false, reason: "update_failed" };
            }

            // Release store capacity
            if (booking.storeId) {
                await Store.findByIdAndUpdate(booking.storeId, {
                    $inc: { booking_assigned_count: -1 },
                });
                console.log(`[Auto Cancel] Released capacity for store ${booking.storeId}`);
            }

            // Clean up all related jobs
            await Promise.all([
                cancelJob("driver-assign", `driver-pickup-${bookingId}`),
                cancelJob("driver-assign", `check-accept-${bookingId}-pickup`),
                cancelJob("driver-assign", `check-accept-${bookingId}-delivery`),
                del(`booking:accept:${bookingId}:pickup`),
                del(`booking:accept:${bookingId}:delivery`),
            ]);

            // TODO: Send push notification to user
            // await notifyUser(updated.userId, {
            //     type: "BOOKING_CANCELLED",
            //     bookingId,
            //     reason,
            // });

            console.log(`[Auto Cancel] Booking ${bookingId} cancelled: ${reason}`);

            return { success: true, bookingId };
        },
        {
            connection: createBullConnection("AutoCancel Worker"),
            concurrency: 5,
        }
    );

    worker.on("error", (err) => {
        console.error("[Auto Cancel] Worker error:", err.message);
    });

    worker.on("failed", (job, err) => {
        console.error(`[Auto Cancel] Job ${job.id} failed:`, err.message);
    });

    return worker;
};

export const getWorker = () => worker;