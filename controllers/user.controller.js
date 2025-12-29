import Booking from "../models/Booking.js";
import User from "../models/User.js";
import { driverAssignReturnQueue } from "../queues/queue.js";
import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";

// User Update
export const updateUserDetails = async (req, res) => {
    try {
        const { name, gender, dob, address, email } = req.body;
        const { auth_id } = req.user;
        const user = await User.findOne({ auth_id });
        if (!user) {
            return sendResponse({ res, message: "User not found", statusCode: 404 });
        }

        Object.assign(user, { name, gender, dob, address, email });
        if (!user.isSignUp){
             user.isSignUp = true;
            }
        user.last_login_at = new Date();
        await user.save();

        sendResponse({ res, message: "User details updated successfully" });

    } catch (err) {
        console.error(err);
        sendResponse({ res, message: "User details update failed", statusCode: 500 });
    }
};

// Return Booking
export const requestReturnLuggage = async (req, res) => {
    try {
        const { booking_id } = req.params;
        const { user_delivery_location } = req.body;
        const booking = await Booking.findById(booking_id);

        if (!booking || booking.status !== "STORED") {
            return sendResponse({
                res,
                message: "Invalid booking state",
                statusCode: STATUS_CODES.BAD_REQUEST
            });
        }

        booking.status = "RETURN_REQUESTED";
        booking.assinment_type = "DELIVERY";

        if (user_delivery_location) {
            booking.user_delivery_location = user_delivery_location;
        }
        await booking.save();
        // Count Total Hours  pickupTime delivery_time and calculate total hours to hold

        // async  driver re-assignment
        await driverAssignQueue.add("assign-driver", {
            bookingId: booking._id
        });

        sendResponse({ res, message: "Return request submitted successfully" });
    } catch (err) {
        console.error(err);
        sendResponse({ res, message: "Booking return failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};
