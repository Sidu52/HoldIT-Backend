import Driver from "../models/Driver.js";
import { addDriverToRedis } from "./driverGeoService.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";
import logger from "../utils/logger.js";


const BATCH_SIZE = 50;

export const syncDriversToRedis = async () => {
    try {
        const availableDrivers = await Driver.find({
            is_online: true,
            is_on_trip: { $ne: true },
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            "currentLocation.coordinates": { $exists: true, $ne: [] },
        })
            .select(
                "_id first_name last_name phone " +
                "currentLocation service_area_id " +
                "is_online is_on_trip " +
                "account_status verification_status vehicle_type"
            )
            .lean();

        // Drivers currently on a trip should NOT be in the geo set.
        // We count them separately so they never show up as "failed".
        const onTripCount = await Driver.countDocuments({
            is_online: true,
            is_on_trip: true,
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
        });
        if (!availableDrivers.length) {
            logger.warn(
                `[Driver Sync] No available drivers to sync` +
                (onTripCount ? ` (${onTripCount} currently on trip — skipped correctly)` : "")
            );
            return { synced: 0, failed: 0, skipped: onTripCount, total: onTripCount };
        }

        logger.info(
            `[Driver Sync] ${availableDrivers.length} available driver(s) to sync` +
            (onTripCount ? `, ${onTripCount} on trip (skipped)` : "")
        );

        let synced = 0;
        let failed = 0;

        for (let i = 0; i < availableDrivers.length; i += BATCH_SIZE) {
            const batch = availableDrivers.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map((driver) => addDriverToRedis(driver))
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];

                if (result.status === "fulfilled" && result.value === true) {
                    synced++;
                } else {
                    failed++;
                    const reason =
                        result.status === "rejected"
                            ? result.reason?.message
                            : "addDriverToRedis returned false — check coordinates or fields";
                    logger.error(
                        `[Driver Sync] Failed for driver ${batch[j]._id}: ${reason}`
                    );
                }
            }
        }

        const total = availableDrivers.length + onTripCount;
        logger.info(
            `[Driver Sync] ${synced} synced, ${failed} failed, ${onTripCount} on-trip skipped (total: ${total})`
        );

        return { synced, failed, skipped: onTripCount, total };
    } catch (err) {
        logger.error("[Driver Sync] Fatal error:", err.message);
        return { synced: 0, failed: 0, skipped: 0, total: 0 };
    }
};