import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import { addDriverToRedis,removeDriverFromRedis } from "../../services/driverSevices.js";


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
        const { lan, lat } = req.body;

        if (!lan || !lat) {
            return res.status(400).json({ message: "Coordinates required" });
        }

        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        // If driver not allowed to take jobs → remove from Redis
        if (!driver.is_active || !driver.is_online) {
            await removeDriverFromRedis(driverId);
            return res.status(403).json({ message: "Driver not eligible" });
        }

        // Update MongoDB
        driver.currentLocation = {
            type: "Point",
            coordinates: [lan, lat]
        };
        driver.last_active_at = new Date();
        await driver.save();

        // Update Redis GEO
        await redis.geoadd(
            "drivers",
            lan,
            lat,
            driverId.toString()
        );

        return res.json({
            message: "Location updated",
            location: driver.currentLocation
        });

    } catch (error) {
        console.error("updateDriverLocation error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};