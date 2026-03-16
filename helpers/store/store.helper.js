// MARK STORED store confirms luggage is checked in

import Booking from "../../models/Booking";
import Driver from "../../models/Driver";
import { markDriverAvailable } from "../../services/driverGeoService";
import { BOOKING_STATUS } from "../../utils/constants";

// Called by the store (or driver on store's behalf). Completes the pickup leg.
export const processMarkStored = async (bookingId, storeId) => {
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