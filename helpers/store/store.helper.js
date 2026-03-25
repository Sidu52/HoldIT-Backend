import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import { markDriverAvailable } from "../../services/driverGeoService.js";
import { BOOKING_STATUS } from "../../utils/constants.js";

// VERIFY STORE
export const verifyStore = (store) => {
    if (!store) {
        return { valid: false, message: "Store not found.", code: STATUS_CODES.NOT_FOUND };
    }

    if (store.status === ACCOUNT_STATUS.BLOCKED) {
        return { valid: false, message: "This store account has been suspended.", code: STATUS_CODES.FORBIDDEN };
    }

    if (!store.is_verified) {
        return { valid: false, message: "Store account is not verified. Please contact support.", code: STATUS_CODES.FORBIDDEN };
    }

    if (!store.is_active) {
        return { valid: false, message: "Store account is not active. Please contact support.", code: STATUS_CODES.FORBIDDEN };
    }

    return { valid: true };
};

// Called by the store (or driver on store's behalf). Completes the pickup leg.
export const processMarkStored = async (bookingId, storeId, notes) => {
    const now = new Date();

    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.AT_STORE,
             storeId: new mongoose.Types.ObjectId(storeId),
        },
        {
            $set: {
                status: BOOKING_STATUS.STORED,
                lastStatusUpdatedAt: now,
                "storage.storedAt": now,
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.STORED,
                    note: notes
                            ? `Luggage accepted by store: ${notes}`
                            : "Luggage accepted and stored by store",
                     updatedBy: new mongoose.Types.ObjectId(storeId),
                    updatedByModel: "Store",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (!booking) return null;

    // Driver is now free
    await Promise.all([
        markDriverAvailable(booking.pickup.assignment.driverId),
        Driver.findByIdAndUpdate(booking.pickup.assignment.driverId, {
            $set: { is_on_trip: false, current_booking_id: null },
        }),
    ]);

    return booking;
};