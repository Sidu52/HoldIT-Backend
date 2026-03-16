import Store from "../models/Store.js";
import { VERIFICATION_STATUS } from "../utils/constants.js";
import { addStoreToRedis } from "./storeServices.js";

export const syncStoresToRedis = async () => {
    try {
        const stores = await Store.find({
            is_active: true,
            is_online: true,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            "location.coordinates": { $exists: true },
        })
            .select(
                "_id location service_area_id is_active is_online " +
                "booking_assigned_count max_booking_capacity rating"
            )
            .lean();

        if (!stores.length) {
            console.warn("⚠️  [Store Sync] No active stores found in database");
            return { synced: 0, failed: 0 };
        }

        let synced = 0;
        let failed = 0;

        for (const store of stores) {
            try {
                const added = await addStoreToRedis(store);
                if (added) {
                    synced++;
                } else {
                    failed++;
                }
            } catch (err) {
                failed++;
                console.error(`[Store Sync] Failed for store ${store._id}:`, err.message);
            }
        }

        console.log(`✅ [Store Sync] ${synced} stores synced to Redis (${failed} failed)`);
        return { synced, failed };
    } catch (err) {
        console.error("❌ [Store Sync] Failed:", err.message);
        return { synced: 0, failed: 0 };
    }
};