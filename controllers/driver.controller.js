import Driver from "../models/Driver.js";
import { sendResponse } from "../utils/apiResponse.js";
import redis from "../services/redisService.js";
import Booking from "../models/Booking.js";
import { STATUS_CODES } from "../utils/constants.js";
import { generateOTP } from "../utils/otp.js";

// Driver Update
export const updateDriverDetails = async (req, res) => {
    try {
        const { name, gender, dob, address, email, vehicleType, licenseNumber, currentLocation } = req.body;
        const { auth_id } = req.user;

        const driver = await Driver.findOne({ auth_id });
        if (!driver) {
            return sendResponse({ res, message: "Driver not found", statusCode: 404 });
        }

        Object.assign(driver, { name, gender, dob, address, email, vehicleType, licenseNumber, currentLocation });
        if (!driver.isSignUp) {
            driver.isSignUp = true;
        }
        // Image VERIFICTION LOGIC PENDING
        driver.last_login_at = new Date();
        await driver.save();
        sendResponse({ res, message: "Driver details updated successfully" });

    } catch (err) {
        console.error(err);
        sendResponse({ res, message: "Driver details update failed", statusCode: 500 });
    }
};

// Driver On Duty
export const driverOnDuty = async (req, res) => {
    try {
        const { status } = req.body;
        const { auth_id } = req.user;

        const driver = await Driver.findOne({ auth_id });
        if (!driver) {
            return sendResponse({ res, message: "Driver not found", statusCode: 404 });
        }

        driver.is_Online = status;
        await driver.save();

        if (status) {
            await redis.geoadd(
                "drivers",
                driver.currentLocation.lng,
                driver.currentLocation.lat,
                driver._id.toString()
            );
        } else {
            await redis.zrem("drivers", driver._id.toString());
            await redis.del(`driver:online:${driver._id}`);

        }


        sendResponse({ res, message: "Driver status updated successfully" });

    } catch (err) {
        console.error(err);
        sendResponse({ res, message: "Driver status update failed", statusCode: 500 });
    }
};

// Accept Booking
export const acceptBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            sendResponse({ res, message: "Invalid Booking", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        booking.status = "DRIVER_ASSIGNED";
        if (booking.assinment_type === "PICKUP") {
            booking.driverAcceptedAt = new Date();
        }
        await booking.save();
        sendResponse({ res, message: "Booking accepted successfully", statusCode: STATUS_CODES.SUCCESS });
    } catch (error) {
        console.error(error);
        sendResponse({ res, message: "Booking acceptance failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Driver Arrived
export const driverArrived = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            sendResponse({ res, message: "Invalid booking state", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        if (booking.assinment_type === "PICKUP") {
            booking.status = "DRIVER_ARRIVED";
            booking.arrivedAt = new Date();
            await booking.save();
        }
        const otp = generateOTP();
        if (booking.assinment_type === "DELIVERY" || booking.assinment_type === "PICKUP") {
            await redis.del(`pickup_otp:${bookingId}`);
            await redis.set(
                `pickup_otp:${bookingId}`,
                otp,
                "EX",
                300 // 5 minutes
            );

        } else {
            await redis.del(`delivery_otp:${bookingId}`);
            await redis.set(
                `delivery_otp:${bookingId}`,
                otp,
                "EX",
                300 // 5 minutes
            );

        }

        sendResponse({ res, message: "OTP generated.", data: otp });
        return;
    } catch (error) {
        console.error(error);
        sendResponse({ res, message: "failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Confirm Pickup
export const confirmPickup = async (req, res) => {
    try {
        const { otp } = req.body;
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            sendResponse({ res, message: "Invalid booking state", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        const redisOtp = await redis.get(`pickup_otp:${bookingId}`);

        if (!redisOtp) {
            sendResponse({ res, message: "OTP expired please generate new OTP", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        if (redisOtp !== otp) {
            sendResponse({ res, message: "Invalid OTP", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        // OTP verified
        await redis.del(`pickup_otp:${bookingId}`);

        if (booking.assinment_type === "PICKUP") {
            booking.status = "PICKED_UP";
            booking.pickupTime = new Date();
        } else if (booking.assinment_type === "DELIVERY") {
            booking.status = "OUT_FOR_RETURN";
            booking.assinment_type = "RETURN";
            booking.pickup_from_storeAt = new Date();
        }
        // Update booking Pickup lat lng when driver live location intregrate
        await booking.save();
        sendResponse({ res, message: "Pickup confirmed." });
    } catch (error) {
        console.error(error);
        sendResponse({ res, message: "Pickup confirmation failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Resend Pickup OTP
export const resendPickupOtp = async (req, res) => {
    try {
        const { bookingId } = req.params;

        await redis.del(`pickup_otp:${bookingId}`);
        const otp = generateOTP();

        await redis.set(`pickup_otp:${bookingId}`, otp, "EX", 300);

        sendResponse({ res, message: "OTP resent successfully", data: otp });
    } catch (error) {
        console.error(error);
        sendResponse({ res, message: "OTP resent failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Store Request OTP
export const requestStoreOtp = async (req, res) => {
    try {
        const { bookingId } = req.params;

        await redis.del(`store_handover_otp:${bookingId}`);
        const otp = generateOTP();

        await redis.set(`store_handover_otp:${bookingId}`, otp, "EX", 300);

        sendResponse({ res, message: "OTP resent successfully", data: otp });
    } catch (error) {
        console.error(error);
        sendResponse({ res, message: "OTP resent failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};

// Delivery Confirmed
export const deliveryConfirmed = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { otp } = req.body;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            sendResponse({ res, message: "Invalid booking state", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        const redisOtp = await redis.get(`delivery_otp:${bookingId}`);

        if (!redisOtp || redisOtp !== otp) {
            sendResponse({ res, message: "OTP expired please generate new OTP", statusCode: STATUS_CODES.BAD_REQUEST });
            return;
        }

        await redis.del(`delivery_otp:${bookingId}`);

        booking.status = "DELIVERED";
        booking.deliveryTime = new Date();
        await booking.save();

        sendResponse({ res, message: "Delivery successfully" });
    } catch (error) {
        console.error(error);
        sendResponse({ res, message: "Delivery failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
    }
};


