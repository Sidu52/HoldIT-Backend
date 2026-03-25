import Store from "../models/Store.js";
import { addStoreToRedis } from "./storeServices.js";
import { VERIFICATION_STATUS } from "../utils/constants.js";
import logger from "../utils/logger.js";


const BATCH_SIZE = 50;

export const syncStoresToRedis = async () => {
    try {
        const stores = await Store.find({
            is_active: true,
            is_online: true,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            "location.coordinates": { $exists: true, $ne: [] },
        })
            .select(
                "_id location service_area_id " +
                "is_active is_online verification_status " +
                "current_booking_count max_booking_capacity rating"
            )
            .lean();

        if (!stores.length) {
            logger.warn("⚠️  [Store Sync] No active/verified stores found in database");
            return { synced: 0, failed: 0 };
        }

        logger.info(`[Store Sync] Found ${stores.length} store(s) to sync`);

        let synced = 0;
        let failed = 0;

        // Process in batches to avoid overwhelming Redis
        for (let i = 0; i < stores.length; i += BATCH_SIZE) {
            const batch = stores.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map((store) => addStoreToRedis(store))
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === "fulfilled" && result.value) {
                    synced++;
                } else {
                    failed++;
                    const reason =
                        result.status === "rejected"
                            ? result.reason?.message
                            : "addStoreToRedis returned false";
                    logger.error(
                        `[Store Sync] Failed for store ${batch[j]._id}: ${reason}`
                    );
                }
            }
        }

        logger.info(`[Store Sync] ${synced} synced, ${failed} failed (total: ${stores.length})`);
        return { synced, failed, total: stores.length };
    } catch (err) {
        logger.error("[Store Sync] Fatal error:", err.message);
        return { synced: 0, failed: 0, total: 0 };
    }
};