import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import redis from "../../services/redisService.js";
import { cancelJob } from "../../services/jobService.js";
import { markDriverOnTrip } from "../../services/driverGeoService.js";
import { BOOKING_STATUS, JOB_QUEUES } from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { BookingKeys } from "../../constants/redis/booking.keys.js";


// GET PENDING OFFER FOR DRIVER
export const getValidOfferForDriver = async (bookingId, driverId) => {
    const offerKey = BookingKeys.offer(bookingId);
    const offer = await redis.hgetall(offerKey); // { status, driverId, attemptNumber }

    if (!offer || !offer.driverId) {
        return { valid: false, reason: "OFFER_NOT_FOUND" };
    }

    if (offer.driverId !== driverId.toString()) {
        return { valid: false, reason: "OFFER_NOT_FOR_YOU" };
    }

    if (offer.status === "accepted") {
        return { valid: false, reason: "ALREADY_ACCEPTED" };
    }

    if (offer.status !== "pending") {
        return { valid: false, reason: "OFFER_EXPIRED" };
    }

    return { valid: true, offer };
};

// ACCEPT BOOKING
export const acceptBookingOffer = async (bookingId, driverId) => {
    // Validate offer in Redis
    const { valid, reason, offer } = await getValidOfferForDriver(
        bookingId,
        driverId
    );

    if (!valid) {
        return { success: false, reason };
    }

    // Check booking state in MongoDB
    const booking = await Booking.findById(bookingId)
        .select("status pickup.assignment.driverId delivery.assignment.driverId userId storeId")
        .lean();

    if (!booking) {
        return { success: false, reason: "BOOKING_NOT_FOUND" };
    }

    if (booking.status === BOOKING_STATUS.CANCELLED) {
        return { success: false, reason: "BOOKING_CANCELLED" };
    }

    if ([BOOKING_STATUS.DRIVER_ASSIGNED, BOOKING_STATUS.RETURN_DRIVER_ASSIGNED].includes(booking.status)) {
        return { success: false, reason: "ALREADY_ASSIGNED" };
    }

    const isReturn = [BOOKING_STATUS.FINAL_PAYMENT_CAPTURED, BOOKING_STATUS.RETURN_REQUESTED].includes(booking.status);

    if (isReturn && booking.delivery?.assignment?.driverId) {
        return { success: false, reason: "DRIVER_ALREADY_SET" };
    }

    if (!isReturn && booking.pickup?.assignment?.driverId) {
        return { success: false, reason: "DRIVER_ALREADY_SET" };
    }

    // Atomically assign driver in MongoDB
    const session = await mongoose.startSession();

    let updatedBooking;

    try {
        session.startTransaction();

        const now = new Date();

        if (isReturn) {
            updatedBooking = await Booking.findOneAndUpdate(
                {
                    _id: bookingId,
                    status: {
                        $in: [
                            BOOKING_STATUS.FINAL_PAYMENT_CAPTURED,
                            BOOKING_STATUS.RETURN_REQUESTED,
                        ],
                    },
                    "delivery.assignment.driverId": { $exists: false },
                },
                {
                    $set: {
                        status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                        lastStatusUpdatedAt: now,
                        "delivery.assignment.driverId": new mongoose.Types.ObjectId(driverId),
                        "delivery.assignment.assignedAt": now,
                        "delivery.assignment.acceptedAt": now,
                        "delivery.driverSearchStatus": "assigned",
                    },
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                            note: "Return driver accepted the booking",
                            updatedBy: driverId,
                            updatedByModel: "Driver",
                            createdAt: now,
                        },
                    },
                },
                { returnDocument: "after", session }
            );
        } else {
            updatedBooking = await Booking.findOneAndUpdate(
                {
                    _id: bookingId,
                    status: {
                        $in: [
                            BOOKING_STATUS.STORE_ASSIGNED,
                        ],
                    },
                    "pickup.assignment.driverId": { $exists: false },
                },
                {
                    $set: {
                        status: BOOKING_STATUS.DRIVER_ASSIGNED,
                        lastStatusUpdatedAt: now,
                        "pickup.assignment.driverId": new mongoose.Types.ObjectId(driverId),
                        "pickup.assignment.assignedAt": now,
                        "pickup.assignment.acceptedAt": now,
                        "pickup.driverSearchStatus": "assigned",
                    },
                    $push: {
                        timeline: {
                            status: BOOKING_STATUS.DRIVER_ASSIGNED,
                            note: "Pickup driver accepted the booking",
                            updatedBy: driverId,
                            updatedByModel: "Driver",
                            createdAt: now,
                        },
                    },
                },
                { returnDocument: "after", session }
            );
        }

        if (!updatedBooking) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, reason: "BOOKING_TAKEN" };
        }

        // Update driver MongoDB state
        await Driver.findByIdAndUpdate(
            driverId,
            {
                $set: {
                    is_on_trip: true,
                    current_booking_id: bookingId,
                    last_active_at: new Date(),
                },
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        try {
            if (session.inTransaction()) await session.abortTransaction();
        } catch (_) { }
        session.endSession();
        throw err;
    }

    // Post-commit side effects
    await Promise.allSettled([

        // Mark offer accepted in Redis
        redis.hset(BookingKeys.offer(bookingId), "status", "accepted"),
        redis.del(BookingKeys.candidates(bookingId)),
        redis.del(BookingKeys.tried(bookingId)),
        redis.del(BookingKeys.searchActive(bookingId)),
        redis.del(BookingKeys.activeDriver(bookingId)),
        redis.del(BookingKeys.driverForBooking(bookingId)),
        

        // Mark driver as on trip in Redis meta
        markDriverOnTrip(driverId, bookingId),

        // Cancel the pending timeout job so it doesn't fire after acceptance
        cancelJob(
            JOB_QUEUES.DRIVER_ASSIGN,
            `timeout-${bookingId}-${offer.attemptNumber ?? 1}`
        ),
    ]);

    return {
        success: true,
        booking: updatedBooking,
        driverId,
    };
};

// REJECT BOOKING
export const rejectBookingOffer = async (bookingId, driverId, reason = "") => {
    // Validate the offer is actually for this driver
    const { valid, reason: offerReason } = await getValidOfferForDriver(
        bookingId,
        driverId
    );

    if (!valid) {
        return { success: false, reason: offerReason };
    }

    // Clear offer and driver lock from Redis
    await Promise.allSettled([redis.del(BookingKeys.offer(bookingId)), redis.del(BookingKeys.driverForBooking(bookingId))]);

    logger.info(
        `[DriverBooking] Driver ${driverId} rejected booking ${bookingId}: ${reason}`
    );

    return { success: true };
};

// GET ACTIVE BOOKING FOR DRIVER 
export const getDriverActiveBooking = async (driverId) => {
    return Booking.findOne({
        "pickup.assignment.driverId": driverId,
        status: {
            $in: [
                BOOKING_STATUS.DRIVER_ASSIGNED,
                BOOKING_STATUS.DRIVER_ARRIVED,
                BOOKING_STATUS.PICKED_UP,
            ],
        },
        isActive: true,
    })
        .select(
            "bookingCode status pickupLocation pickup storage userId " +
            "luggage timeline lastStatusUpdatedAt storeId"
        )
        .populate("userId", "first_name last_name phone")
        .populate("storeId", "store_name store_contact_number location")
        .lean();
};
