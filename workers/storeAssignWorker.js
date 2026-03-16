import { Worker } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";
import redis from "../services/redisService.js";
import Booking from "../models/Booking.js";
import Store from "../models/Store.js";
import { BOOKING_STATUS } from "../utils/constants.js";
import { addJobToQueue } from "../services/jobService.js";

const SEARCH_RADII_KM = [3, 5, 8];

let worker;

export const createStoreAssignWorker = () => {
    worker = new Worker(
        "store-assign",
        async (job) => {
            const { bookingId } = job.data;
            if (!bookingId) {
                throw new Error("storeAssignWorker: Missing bookingId");
            }

            const booking = await Booking.findById(bookingId);

            if (!booking) {
                console.warn(`storeAssignWorker: Booking ${bookingId} not found`);
                return { success: false, reason: "booking_not_found" };
            }

            if (booking.status === BOOKING_STATUS.CANCELLED) {
                return { success: false, reason: "booking_cancelled" };
            }

            if (booking.storeId || booking.status !== BOOKING_STATUS.CREATED) {
                return { success: false, reason: "already_assigned_or_wrong_status" };
            }

            const { lat, lng } = booking.pickupLocation || {};

            if (lat == null || lng == null) {
                throw new Error(`Invalid pickup location for booking ${bookingId}`);
            }

            const geoKey = booking.serviceAreaId
                ? `stores:${booking.serviceAreaId}`
                : "stores:global";

            let storeIds = [];

            for (const radius of SEARCH_RADII_KM) {
                try {
                    storeIds = await redis.geosearch(
                        geoKey,
                        "FROMLONLAT",
                        lng,
                        lat,
                        "BYRADIUS",
                        radius,
                        "km",
                        "ASC"
                    );
                } catch (geoErr) {
                    console.warn(`Geo search failed at ${radius}km:`, geoErr.message);
                    storeIds = [];
                }

                if (storeIds && storeIds.length > 0) break;
            }

            if (!storeIds.length) {
                await Booking.findByIdAndUpdate(bookingId, {
                    status: BOOKING_STATUS.STORE_ASSIGNED,
                    storeId: null,
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.STORE_ASSIGNED,
                            note: "No store found within search radius — proceeding to driver",
                        },
                    },
                });

                await triggerDriverAssignment(bookingId);
                return { success: true, bookingId, storeAssigned: false };
            }

            const stores = await Store.find({
                _id: { $in: storeIds },
                is_active: true,
                is_online: true,
                verification_status: "VERIFIED",
            }).select("_id booking_assigned_count max_booking_capacity rating");

            if (!stores.length) {
                await Booking.findByIdAndUpdate(bookingId, {
                    status: BOOKING_STATUS.STORE_ASSIGNED,
                    storeId: null,
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.STORE_ASSIGNED,
                            note: "Stores found but none active/verified — proceeding without store",
                        },
                    },
                });

                await triggerDriverAssignment(bookingId);
                return { success: true, bookingId, storeAssigned: false };
            }
            const selectedStore = selectBestStore(stores, storeIds);

            if (!selectedStore) {
                // All stores at capacity
                await Booking.findByIdAndUpdate(bookingId, {
                    status: BOOKING_STATUS.STORE_ASSIGNED,
                    storeId: null,
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.STORE_ASSIGNED,
                            note: "All nearby stores at capacity",
                        },
                    },
                });

                await triggerDriverAssignment(bookingId);
                return { success: true, bookingId, storeAssigned: false };
            }

            const updatedStore = await Store.findOneAndUpdate(
                {
                    _id: selectedStore._id,
                    is_active: true,
                    $expr: {
                        $lt: ["$booking_assigned_count", "$max_booking_capacity"],
                    },
                },
                {
                    $inc: { booking_assigned_count: 1 },
                },
                { new: true }
            );

            if (!updatedStore) {
                console.warn(`Store ${selectedStore._id} at capacity during assignment`);
                throw new Error("Store capacity race condition — will retry");
            }

            await Booking.findByIdAndUpdate(bookingId, {
                storeId: updatedStore._id,
                status: BOOKING_STATUS.STORE_ASSIGNED,
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.STORE_ASSIGNED,
                        note: `Store ${updatedStore._id} assigned automatically`,
                    },
                },
            });

            await triggerDriverAssignment(bookingId);

            return {
                success: true,
                bookingId,
                storeId: updatedStore._id,
                storeAssigned: true,
            };
        },
        {
            connection: redisConnectionConfig,
            concurrency: 10,
            limiter: {
                max: 50,
                duration: 1000,
            },
        }
    );

    worker.on("error", (err) => {
        console.error("storeAssignWorker error:", err.message);
    });

    worker.on("failed", async (job, err) => {
        console.error(
            `storeAssign failed for booking ${job?.data?.bookingId}:`,
            err.message,
            `(attempt ${job?.attemptsMade})`
        );
        if (job?.attemptsMade >= (job?.opts?.attempts || 3)) {
            try {
                await Booking.findByIdAndUpdate(job.data.bookingId, {
                    status: BOOKING_STATUS.CANCELLED,
                    cancelReason: "Store assignment failed after all retries",
                    cancelledBy: "SYSTEM",
                    cancelledAt: new Date(),
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.CANCELLED,
                            note: `Store assignment failed: ${err.message}`,
                        },
                    },
                });
            } catch (updateErr) {
                console.error("Failed to cancel booking:", updateErr.message);
            }
        }
    });

    return worker;
};

function selectBestStore(stores, orderedStoreIds) {
    const storeMap = new Map(
        stores.map((s) => [s._id.toString(), s])
    );

    // Walk through distance-sorted IDs, pick first with capacity
    for (const id of orderedStoreIds) {
        const store = storeMap.get(id.toString?.() || id);
        if (!store) continue;

        const assigned = store.booking_assigned_count || 0;
        const capacity = store.max_booking_capacity || 50;

        if (assigned < capacity) {
            return store;
        }
    }

    return null;
}

async function triggerDriverAssignment(bookingId) {
    await addJobToQueue(
        "driver-assign",
        {
            name: "ASSIGN_DRIVER",
            data: { bookingId, type: "PICKUP" },
        },
        {
            jobId: `driver-pickup-${bookingId}`,
            attempts: 5,
            backoff: {
                type: "exponential",
                delay: 10000,
            },
        }
    );
}

export const getWorker = () => worker;