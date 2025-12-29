import Booking from "../models/Booking.js";
import { sendResponse } from "../utils/apiResponse.js";
import { driverAssignQueue } from "../queues/queue.js";
import User from "../models/User.js";

export const createBooking = async (req, res) => {
    try {
        const { pickup_location, bags_count } = req.body;
        const { auth_id } = req.user;
        const user = await User.findOne({ auth_id });
        const booking = await Booking.create({
            userId: user._id,
            user_pickup_location:pickup_location,
            user_delivery_location: pickup_location,
            bags_count,
            status: "CREATED",
            pricing: { per_hour_rate: 50 } // Change this to fetch rate from DB
        });

        // async store assignment
        const store = await storeAssignQueue.add("assign-store", {
            bookingId: booking._id
        });

        if (store.failed) {
            sendResponse({ res, message: "Store assignment failed", statusCode: 500 });
            return;
        }

        // async driver assignment
        const driver = await driverAssignQueue.add("assign-driver", {
            bookingId: booking._id
        });

        if (driver.failed) {
            sendResponse({ res, message: "Driver assignment failed", statusCode: 500 });
            return;
        }
        sendResponse({ res, message: "Booking created successfully", data: booking });
    } catch (error) {
        sendResponse({ res, message: "Booking creation failed", statusCode: 500 });
    }
};
