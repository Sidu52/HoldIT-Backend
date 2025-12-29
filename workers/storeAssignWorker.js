import { Worker } from "bullmq";
import redis from "../services/redisService.js";
import Booking from "../models/Booking.js";
import Store from "../models/Store.js";

export const storeAssignWorker = new Worker(
  "store-assign",
  async (job) => {
    const { bookingId } = job.data;

    const booking = await Booking.findById(bookingId);
    if (!booking || booking.status !== "CREATED") return;

    const { lat, lng } = booking.user_pickup_location;

    // Find stores within 5 km
    let stores = await redis.geosearch(
      "stores",
      "FROMLONLAT",
      lng,
      lat,
      "BYRADIUS",
      5,
      "km"
    );

    if (!stores.length) {
      throw new Error("No store found within 5km");
    }

    // If too many stores, narrow to 3 km
    if (stores.length > 3) {
      const closerStores = await redis.geosearch(
        "stores",
        "FROMLONLAT",
        lng,
        lat,
        "BYRADIUS",
        3,
        "km"
      );

      if (closerStores.length) {
        stores = closerStores;
      }
    }

    // Get active booking count per store
    const storeLoad = await Promise.all(
      stores.map(async (storeId) => {
        const count = await Booking.countDocuments({
          storeId,
          status: { $nin: ["CANCELLED"] }
        });

        return { storeId, count };
      })
    );

    // Sort by least bookings
    storeLoad.sort((a, b) => a.count - b.count);

    const minLoad = storeLoad[0].count;

    // If multiple stores have same load → random
    const leastLoadedStores = storeLoad.filter(
      (s) => s.count === minLoad
    );

    const selectedStore =
      leastLoadedStores[
      Math.floor(Math.random() * leastLoadedStores.length)
      ];

    // Assign store
    booking.storeId = selectedStore.storeId;
    booking.store_location = selectedStore.location;

    await booking.save();

    await Store.findByIdAndUpdate(
      selectedStore.storeId,
      {
        $push: {
          bookingId: bookingId
        },
        $inc: {
          bookingAssigned: 1
        },
        $set: {
          lastAssignedAt: new Date()
        }
      },
      { new: true }
    );
    return {
      bookingId,
      storeId: selectedStore.storeId
    };
  },
  {
    connection: redis.duplicate()
  }
);
