import redis, { del } from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import { addDriverToRedis, removeDriverFromRedis } from "../../services/driverGeoService.js";
import logger from "../../utils/logger.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";

// Get Driver Profile
export const getDriverProfile = asyncHandler(async (req, res) => {
  const driverId = req.user.auth_id;
  const driver = await Driver.findById(driverId)
    .select("-password_hash -__v")
    .lean();

  if (!driver) {
    return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
  }

  return sendResponse({
    res,
    message: "Driver profile fetched successfully",
    data: { driver },
  });
});

// Update Driver Information
export const updateDriverInfo = asyncHandler(async (req, res) => {
  const driverId = req.user.auth_id;
  const { first_name, last_name, email, gender, date_of_birth, address } = req.body;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
  }

  // Check email uniqueness only if email is provided
  if (email) {
    const emailExists = await Driver.findOne({
      email: email.toLowerCase(),
      _id: { $ne: driverId },
    })
      .select("_id")
      .lean();

    if (emailExists) {
      return sendError(res, "Email already in use by another account", STATUS_CODES.CONFLICT);
    }
  }

  // Build update object dynamically
  const updateFields = {};

  if (first_name) updateFields.first_name = first_name.trim();
  if (last_name) updateFields.last_name = last_name.trim();
  if (email) updateFields.email = email.trim().toLowerCase();
  if (gender) updateFields.gender = gender.toLowerCase();
  if (date_of_birth) updateFields.date_of_birth = new Date(date_of_birth);
  if (address) updateFields.address = address.trim();

  const updatedDriver = await Driver.findByIdAndUpdate(
    driverId,
    { $set: updateFields },
    { new: true, runValidators: true }
  )
    .select("-password_hash -__v")
    .lean();

  if (!updatedDriver) {
    return sendError(res, "Failed to update profile", STATUS_CODES.INTERNAL_SERVER_ERROR);
  }
  // Invalidate profile cache
  await del(`driver:profile:${driverId}`);
  return sendResponse({
    res,
    message: "Profile updated successfully",
    data: { driver: updatedDriver },
  });
});
// Online Offline Driver 
export const updateDriverStatus = asyncHandler(async (req, res) => {
  const driverId = req.user.auth_id;
  const { is_online } = req.body;
  if (typeof is_online !== "boolean") {
    return sendError(res, "is_online must be boolean", STATUS_CODES.BAD_REQUEST);
  }
  const driver = await Driver.findById(driverId);
  if (!driver) {
    return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
  }
  driver.is_online = is_online;
  // if is_online  
  if (is_online) {
    await addDriverToRedis(driver);
  } else {
    await removeDriverFromRedis(driverId);
  }
  await driver.save();
  return sendResponse({ res, message: "Driver status updated", data: { is_online } });
});

// Change Current Location
export const updateDriverLocation = asyncHandler(async (req, res) => {
  const driverId = req.user.auth_id;
  const { lng, lat } = req.body;

  if (!lng || !lat) {
    return sendError(res, "Coordinates required", STATUS_CODES.BAD_REQUEST);
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return sendError(res, "Invalid coordinates", STATUS_CODES.BAD_REQUEST);
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
  }

  if (driver.account_status != ACCOUNT_STATUS.ACTIVE || !driver.is_online) {
    await removeDriverFromRedis(driverId, driver.service_area_id);
    return sendError(res, "Driver not eligible", STATUS_CODES.FORBIDDEN);
  }

  driver.currentLocation = {
    type: "Point",
    coordinates: [lng, lat],
  };
  driver.last_active_at = new Date();
  await driver.save();

  return sendResponse({
    res,
    message: "Location updated",
    data: { location: driver.currentLocation },
  });
});