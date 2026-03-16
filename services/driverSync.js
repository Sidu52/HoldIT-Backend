import Driver from "../models/Driver.js";
import { addDriverToRedis } from "./driverGeoService.js";

export const syncDriversToRedis = async () => {
    try {
        // ✅ Match YOUR actual DB field names and values
        const drivers = await Driver.find({
            is_active: true,
            is_online: true,
            // YOUR status values
            status: "approved",
            verification_status: "success",
            // YOUR location field
            "currentLocation.coordinates": { $exists: true },
        })
            .select(
                "_id first_name last_name phone currentLocation service_area_id " +
                "is_active is_online is_verified is_on_trip " +
                "status verification_status vehicle_type rating current_booking_id"
            )
            .lean();

        if (!drivers.length) {
            console.warn("⚠️  [Driver Sync] No active/online drivers found");
            return { synced: 0, failed: 0 };
        }

        let synced = 0;
        let failed = 0;

        for (const driver of drivers) {
            try {
                const added = await addDriverToRedis(driver);
                if (added) synced++;
                else failed++;
            } catch (err) {
                failed++;
                console.error(`[Driver Sync] Failed for driver ${driver._id}:`, err.message);
            }
        }

        console.log(`✅ [Driver Sync] ${synced} drivers synced to Redis (${failed} failed)`);
        return { synced, failed };
    } catch (err) {
        console.error("❌ [Driver Sync] Failed:", err.message);
        return { synced: 0, failed: 0 };
    }
};