import AuthUser from "../models/AuthUsers.js";
import Booking from "../models/Booking.js";
import Store from "../models/Store.js";
import StoreOwner from "../models/StoreOwner.js";
import redis from "../services/redisService.js";
import { sendResponse } from "../utils/apiResponse.js";
import { ACCOUNT_STATUS, STATUS_CODES } from "../utils/constants.js";

// Add Store
export const addStoreDetails = async (req, res) => {
  try {
    const { auth_id } = req.user;
    const {
      store_name,
      store_address,
      store_capacity,
      store_open_time,
      store_close_time,
      store_description,
      lat,
      lng
    } = req.body;

    const authuser = await AuthUser.findOne({
      auth_id
    });
    if (authuser && authuser.status !== ACCOUNT_STATUS.ACTIVE) {
      return sendResponse({
        res,
        statusCode: STATUS_CODES.UNAUTHORIZED,
        message: "Unauthorized"
      });
    }

    const storeOwner = await StoreOwner.findOne({
      auth_id,
    });

    if (!storeOwner) {
      return sendResponse({
        res,
        statusCode: STATUS_CODES.NOT_FOUND,
        message: "Store owner not found"
      });
    }

    // 5 KM radius check
    const existingNearbyStore = await Store.findOne({
      store_owner_id: storeOwner._id,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          $maxDistance: 5000
        }
      }
    });

    if (existingNearbyStore) {
      return sendResponse({
        res,
        statusCode: STATUS_CODES.BAD_REQUEST,
        message: "You already have a store within 5 KM radius"
      });
    }

    // Create store
    const store = await Store.create({
      store_name,
      store_address,
      store_capacity,
      store_open_time,
      store_close_time,
      store_description,
      location: {
        type: "Point",
        coordinates: [lng, lat]
      },
      store_owner_id: storeOwner._id
    });

    // ADD store to store owner
    await storeOwner.updateOne({
      $push: {
        store_id: store._id
      }
    })

    return sendResponse({
      res,
      message: "Store created successfully",
      data: { store_id: store._id }
    });

  } catch (error) {
    console.error("Add Store Error:", error);

    return sendResponse({
      res,
      statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: "Failed to create store"
    });
  }
};

// Accept Luggage
export const acceptLuggage = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { otp } = req.body;

    const savedOTP = await redis.get(`store_handover_otp:${bookingId}`);

    if (!savedOTP || savedOTP !== otp) {
      return sendResponse({
        res,
        message: "Invalid or expired OTP",
        statusCode: 400
      });
    }

    await redis.del(`store_handover_otp:${bookingId}`);
    // Update booking status
    const booking = await Booking.findByIdAndUpdate(bookingId, {
      $set: {
        status: "STORED"
      }
    });


    await redis.del(`store_handover_otp:${bookingId}`); // Delete OTP
    await redis.del(`driver:lock:${booking.pickup_driverId}`); // Unlock driver

    return sendResponse({
      res,
      message: "Luggage accepted successfully"
    });
  } catch (error) {
    console.error("Accept Luggage Error:", error);

    return sendResponse({
      res,
      statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: "Failed to accept luggage"
    });
  }
};

// Store Handover Return
export const storeHandoverReturn = async (req, res) => {
  const { otp } = req.body;
  const key = `return_pickup_otp:${req.params.id}`;

  const savedOtp = await redis.get(key);
  if (savedOtp !== otp) {
    return sendResponse({ res, message: "Invalid OTP", statusCode: 400 });
  }

  const booking = await Booking.findById(req.params.id);
  booking.status = "OUT_FOR_RETURN";
  await booking.save();

  await redis.del(key);

  sendResponse({ res, message: "Luggage handed to driver" });
};
