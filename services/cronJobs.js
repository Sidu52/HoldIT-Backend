import cron from "node-cron";
import Driver from "../models/Driver.js";
import Store from "../models/Store.js";
import { removeDriverFromRedis } from "./driverGeoService.js";
import { removeStoreFromRedis } from "./storeServices.js";
import logger from "../utils/logger.js";

const BATCH_SIZE = 50;
const activeTasks = [];


const setAllDriversOffline = async () => {
    try {
        logger.info("[Cron] Starting nightly driver offline job...");

        // Fetch all online drivers (need _id and service_area_id for Redis cleanup)
        const onlineDrivers = await Driver.find({ is_online: true })
            .select("_id service_area_id")
            .lean();

        if (!onlineDrivers.length) {
            logger.info("[Cron] No online drivers found. Skipping.");
            return;
        }

        // Bulk update MongoDB — set all online drivers to offline
        const bulkResult = await Driver.updateMany(
            { is_online: true },
            { $set: { is_online: false } }
        );

        logger.info(`[Cron] ${bulkResult.modifiedCount} driver(s) set to offline in MongoDB`);

        // Remove each driver from Redis geo sets and meta hashes
        let removed = 0;
        let failed = 0;

        for (let i = 0; i < onlineDrivers.length; i += BATCH_SIZE) {
            const batch = onlineDrivers.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map((d) => removeDriverFromRedis(d._id, d.service_area_id))
            );

            for (const result of results) {
                if (result.status === "fulfilled" && result.value) {
                    removed++;
                } else {
                    failed++;
                }
            }
        }

        logger.info(
            `[Cron] Driver offline job complete — ${removed} removed from Redis, ${failed} failed`
        );
    } catch (err) {
        logger.error("[Cron] Driver offline job failed:", err.message);
    }
};

const setAllStoresOffline = async () => {
    try {
        logger.info("[Cron] Starting nightly store offline job...");

        // Fetch all online stores (need _id and service_area_id for Redis cleanup)
        const onlineStores = await Store.find({ is_online: true })
            .select("_id service_area_id")
            .lean();

        if (!onlineStores.length) {
            logger.info("[Cron] No online stores found. Skipping.");
            return;
        }

        // Bulk update MongoDB — set all online stores to offline
        const bulkResult = await Store.updateMany(
            { is_online: true },
            { $set: { is_online: false } }
        );

        logger.info(`[Cron] ${bulkResult.modifiedCount} store(s) set to offline in MongoDB`);

        // Remove each store from Redis geo sets and meta hashes
        let removed = 0;
        let failed = 0;

        for (let i = 0; i < onlineStores.length; i += BATCH_SIZE) {
            const batch = onlineStores.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map((s) => removeStoreFromRedis(s._id, s.service_area_id))
            );

            for (const result of results) {
                if (result.status === "fulfilled" && result.value) {
                    removed++;
                } else {
                    failed++;
                }
            }
        }

        logger.info(
            `[Cron] Store offline job complete — ${removed} removed from Redis, ${failed} failed`
        );
    } catch (err) {
        logger.error("[Cron] Store offline job failed:", err.message);
    }
};

export const initCronJobs = () => {
    // Schedule: 23:59 every night  (minute=59, hour=23)
    const driverTask = cron.schedule("59 23 * * *", setAllDriversOffline, {
        timezone: "Asia/Kolkata",
    });

    const storeTask = cron.schedule("59 23 * * *", setAllStoresOffline, {
        timezone: "Asia/Kolkata",
    });

    activeTasks.push(driverTask, storeTask);

    logger.info("[Cron] Nightly offline jobs scheduled at 23:59 IST (drivers + stores)");
};

export const stopCronJobs = () => {
    for (const task of activeTasks) {
        task.stop();
    }
    logger.info(`[Cron] ${activeTasks.length} cron job(s) stopped`);
};
