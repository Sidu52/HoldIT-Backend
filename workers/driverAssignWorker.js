import { Worker } from "bullmq";
import redis from "../services/redisService.js";
import Booking from "../models/Booking.js";

// Worker for processing the 'driver-assign' job
export const driverAssignWorker = new Worker(
  "driver-assign",
  async (job) => {
    const { bookingId } = job.data;

    const booking = await Booking.findById(bookingId);
    if (!booking) return;

    const { lat, lng } = booking.assinment_type === "PICKUP" ? booking.user_pickup_location : booking.user_delivery_location;
    const drivers = await redis.geosearch(
      "drivers",
      "FROMLONLAT",
      lng,
      lat,
      "BYRADIUS",
      5,
      "km"
    );
    for (const driverId of drivers) {
      // Unlock Driver
      await redis.del(`driver:lock:${driverId}`);
      const locked = await redis.set(
        `driver:lock:${driverId}`,
        bookingId,
        "NX",
        "EX",
        300
      );

      if (locked) {
        console.log("LOCKED", locked)
        booking.assinment_type === "PICKUP"  ? booking.pickup_driverId = driverId : booking.delivery_driverId = driverId;
        await booking.save();
        return;
      }
    }
    sendResponse({
      res,
      statusCode: STATUS_CODES.BAD_REQUEST,
      message: "No driver available"
    });
  },
  {
    connection: redis.duplicate(),
  }
);