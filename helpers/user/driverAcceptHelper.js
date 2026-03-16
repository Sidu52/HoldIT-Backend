import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
import { createTimelineEntry } from "./bookingHelper.js";

export const handleDriverAccept = async (bookingId, driverId) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const booking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                status: BOOKING_STATUS.DRIVER_SEARCH,
                "pickup.assignment.driverId": { $exists: false },
            },
            {
                $set: {
                    status: BOOKING_STATUS.DRIVER_ASSIGNED,
                    "pickup.assignment": {
                        driverId: new mongoose.Types.ObjectId(driverId),
                        assignedAt: new Date(),
                        acceptedAt: new Date(),
                    },
                },
                $push: {
                    timeline: createTimelineEntry(
                        BOOKING_STATUS.DRIVER_ASSIGNED,
                        "Driver accepted the booking",
                        driverId,
                        "Driver"
                    ),
                },
            },
            {
                new: true,
                session,
            }
        ).lean();

        if (!booking) {
            await session.abortTransaction();
            session.endSession();
            const existingBooking = await Booking.findById(bookingId)
                .select("status pickup.assignment.driverId")
                .lean();

            if (!existingBooking) {
                return { success: false, message: "Booking not found.", booking: null };
            }

            if (existingBooking.pickup?.assignment?.driverId) {
                return {
                    success: false,
                    message: "Booking already assigned to another driver.",
                    booking: null,
                };
            }

            if (existingBooking.status === BOOKING_STATUS.CANCELLED) {
                return {
                    success: false,
                    message: "Booking has been cancelled.",
                    booking: null,
                };
            }

            return {
                success: false,
                message: "Booking is no longer available.",
                booking: null,
            };
        }

        await session.commitTransaction();
        session.endSession();

        return {
            success: true,
            message: "Booking accepted successfully.",
            booking,
        };
    } catch (err) {
        try {
            if (session.inTransaction()) await session.abortTransaction();
        } catch (_) {}
        session.endSession();

        console.error("Driver accept error:", err);
        return { success: false, message: "Failed to accept booking.", booking: null };
    }
};