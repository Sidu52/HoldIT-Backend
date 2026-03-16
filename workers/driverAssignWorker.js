import { Worker } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";

import redis from "../services/redisService.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import { BOOKING_STATUS } from "../utils/constants.js";
import { addJobToQueue } from "../services/jobService.js";

const SEARCH_RADIUS_KM = 5;
const DRIVER_ACCEPT_TTL = 120;

let worker;

export const createDriverAssignWorker = () => {
    worker = new Worker(
        "driver-assign",
        async (job) => {
            const handler = jobHandlers[job.name];
            if (!handler) {
                console.warn(`Unknown job name: ${job.name}`);
                return { success: false, reason: "unknown_job" };
            }
            return handler(job);
        },
        {
            connection: redisConnectionConfig,
            concurrency: 10,
            settings: { lockDuration: 60000 },
        }
    );

    worker.on("error", (err) => {
        console.error("driverAssignWorker error:", err.message);
    });

    worker.on("failed", async (job, err) => {
        if (job?.name !== "ASSIGN_DRIVER") return;

        console.error(
            `driverAssign failed for ${job?.data?.bookingId}:`,
            err.message,
            `(attempt ${job?.attemptsMade})`
        );

        if (job?.attemptsMade >= (job?.opts?.attempts || 3)) {
            const { bookingId, type } = job.data;
            try {
                await Booking.findOneAndUpdate(
                    { _id: bookingId, status: { $ne: BOOKING_STATUS.CANCELLED } },
                    {
                        status: BOOKING_STATUS.CANCELLED,
                        cancelReason: `No ${type?.toLowerCase()} driver available`,
                        cancelledBy: "SYSTEM",
                        cancelledAt: new Date(),
                        $push: {
                            timeline: {
                                status: BOOKING_STATUS.CANCELLED,
                                note: `Driver assignment exhausted: ${err.message}`,
                            },
                        },
                    }
                );
            } catch (updateErr) {
                console.error("Failed to cancel booking:", updateErr.message);
            }
        }
    });

    return worker;
};

const jobHandlers = {
    ASSIGN_DRIVER: handleDriverAssignment,
    CHECK_DRIVER_ACCEPTANCE: handleAcceptanceCheck,
};

async function handleDriverAssignment(job) {
    const { bookingId, type } = job.data;

    if (!bookingId || !["PICKUP", "DELIVERY"].includes(type)) {
        throw new Error(`Invalid job data: ${bookingId}, ${type}`);
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return { success: false, reason: "not_found" };
    if (booking.status === BOOKING_STATUS.CANCELLED) {
        return { success: false, reason: "cancelled" };
    }

    const validStatuses = type === "PICKUP"
        ? [BOOKING_STATUS.STORE_ASSIGNED, BOOKING_STATUS.CREATED]
        : [BOOKING_STATUS.RETURN_REQUESTED];

    if (!validStatuses.includes(booking.status)) {
        return { success: false, reason: "wrong_status" };
    }

    const location = type === "PICKUP"
        ? booking.pickupLocation
        : booking.deliveryLocation;

    if (!location || location.lat == null || location.lng == null) {
        throw new Error(`Invalid ${type} location for ${bookingId}`);
    }

    const geoKey = booking.serviceAreaId
        ? `drivers:${booking.serviceAreaId}`
        : "drivers:global";

    let driverIds;
    try {
        driverIds = await redis.geosearch(
            geoKey, "FROMLONLAT", location.lng, location.lat,
            "BYRADIUS", SEARCH_RADIUS_KM, "km", "ASC"
        );
    } catch (err) {
        driverIds = [];
    }

    if (!driverIds?.length) {
        throw new Error("No drivers in range");
    }

    const activeDrivers = await Driver.find({
        _id: { $in: driverIds },
        is_active: true,
        is_online: true,
        is_verified: true,
        status: "ACTIVE",
    }).select("_id");

    if (!activeDrivers.length) {
        for (const id of driverIds) {
            await redis.zrem(geoKey, id.toString());
        }
        throw new Error("No active drivers");
    }

    const closestDriver = activeDrivers[0];
    const now = new Date();
    const assignmentField = type === "PICKUP"
        ? "pickup.assignment"
        : "delivery.assignment";
    const statusField = type === "PICKUP"
        ? BOOKING_STATUS.DRIVER_ASSIGNED
        : BOOKING_STATUS.DELIVERY_ASSIGNED;

    const updatedBooking = await Booking.findOneAndUpdate(
        { _id: bookingId, status: { $in: validStatuses } },
        {
            status: statusField,
            [`${assignmentField}.driverId`]: closestDriver._id,
            [`${assignmentField}.assignedAt`]: now,
            lastStatusUpdatedAt: now,
            $push: {
                timeline: {
                    status: statusField,
                    note: `Driver ${closestDriver._id} assigned for ${type}`,
                },
            },
        },
        { new: true }
    );

    if (!updatedBooking) {
        return { success: false, reason: "concurrent_modification" };
    }

    const acceptKey = `booking:accept:${bookingId}:${type.toLowerCase()}`;
    await redis.set(acceptKey, closestDriver._id.toString(), "EX", DRIVER_ACCEPT_TTL);

    await addJobToQueue(
        "driver-assign",
        {
            name: "CHECK_DRIVER_ACCEPTANCE",
            data: { bookingId, type, driverId: closestDriver._id.toString() },
        },
        {
            delay: (DRIVER_ACCEPT_TTL + 5) * 1000,
            jobId: `check-accept-${bookingId}-${type.toLowerCase()}`,
            attempts: 1,
            removeOnComplete: true,
        }
    );

    return { success: true, bookingId, driverId: closestDriver._id, type };
}

async function handleAcceptanceCheck(job) {
    const { bookingId, type, driverId } = job.data;
    if (!bookingId) return;

    const acceptKey = `booking:accept:${bookingId}:${type.toLowerCase()}`;
    const stillPending = await redis.get(acceptKey);

    if (!stillPending) {
        return { success: true, reason: "already_resolved" };
    }

    await redis.del(acceptKey);

    const assignmentField = type === "PICKUP"
        ? "pickup.assignment"
        : "delivery.assignment";

    await Booking.findOneAndUpdate(
        { _id: bookingId, [`${assignmentField}.driverId`]: driverId },
        {
            status: BOOKING_STATUS.CANCELLED,
            cancelReason: "Driver did not accept within timeout",
            cancelledBy: "SYSTEM",
            cancelledAt: new Date(),
            [`${assignmentField}.cancelledAt`]: new Date(),
            $push: {
                timeline: {
                    status: BOOKING_STATUS.CANCELLED,
                    note: `Driver ${driverId} timeout for ${type}`,
                },
            },
        }
    );

    return { success: true, reason: "driver_timeout" };
}

export const getWorker = () => worker;