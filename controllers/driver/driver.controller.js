import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import { addDriverToRedis,removeDriverFromRedis } from "../../services/driverGeoService.js";


// Get Driver Profile
export const getDriverProfile = async (req, res) => {
  try {
    const driverId = req.user.auth_id;
    const driver = await Driver.findById(driverId)
      .select("-password_hash -__v")
      .lean();

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    return res.json({
      message: "Driver profile fetched successfully",
      data: { driver },
    });
  } catch (err) {
    console.error("Get Driver Profile Error:", err);
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
};

// Update Driver Information
export const updateDriverInfo = async (req, res) => {
  try {
    const driverId = req.user.auth_id;
    const { first_name, last_name, email, gender, dob, address } = req.body;
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
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
        return res.status(409).json({ message: "Email already in use by another account" });
      }
    }

    // Build update object dynamically
    const updateFields = {};

    if (first_name) updateFields.first_name = first_name.trim();
    if (last_name) updateFields.last_name = last_name.trim();
    if (email) updateFields.email = email.trim().toLowerCase();
    if (gender) updateFields.gender = gender.toLowerCase();
    if (dob) updateFields.dob = new Date(dob);
    if (address) updateFields.address = address.trim();

    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      { $set: updateFields },
      { new: true, runValidators: true }
    )
      .select("-password_hash -__v")
      .lean();

    if (!updatedDriver) {
      return res.status(500).json({ message: "Failed to update profile" });
    }

    return res.json({
      message: "Profile updated successfully",
      data: { driver: updatedDriver },
    });

  } catch (err) {
    console.error("Update Driver Details Error:", err);
    return res.status(500).json({ message: "Failed to update profile" });
  }
};
// Online Offline Driver 
export const updateDriverStatus = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { is_online } = req.body;
        if (typeof is_online !== "boolean") {
            return res.status(400).json({ message: "is_online must be boolean" });
        }
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }
        driver.is_online = is_online;
        // if is_online  
        if (is_online) {
            await addDriverToRedis(driver);
        } else {
            await removeDriverFromRedis(driverId);
        }
        await driver.save();
        return res.json({ message: "Driver status updated", is_online });
    } catch (error) {
        console.error("updateDriverStatus error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Change Current Location
export const updateDriverLocation = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { lng, lat } = req.body; // ✅ fix: lan → lng

        if (!lng || !lat) {
            return res.status(400).json({ message: "Coordinates required" });
        }

        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            return res.status(400).json({ message: "Invalid coordinates" });
        }

        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        if (!driver.is_active || !driver.is_online) {
            await removeDriverFromRedis(driverId, driver.service_area_id);
            return res.status(403).json({ message: "Driver not eligible" });
        }

        // ✅ Update MongoDB — post-save hook will handle Redis automatically
        driver.currentLocation = {
            type: "Point",
            coordinates: [lng, lat], // ✅ [lng, lat] order for GeoJSON
        };
        driver.last_active_at = new Date();
        await driver.save(); // ✅ hook calls addDriverToRedis(driver) with correct keys

        return res.json({
            message: "Location updated",
            location: driver.currentLocation,
        });

    } catch (error) {
        console.error("updateDriverLocation error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};