import { DriverKeys } from "../driver.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

export const invalidateDriverCache = async (driverId) => {
    const jobs = [
        deleteCache(DriverKeys.profile(driverId)),
        deleteCache(DriverKeys.publicView(driverId)),
        deleteByPattern(DriverKeys.reviewsPattern(driverId)),
        deleteCache(AdminKeys.driverDetail(driverId)),
        deleteByPattern(AdminKeys.driverListPattern()),
    ];

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateDriverCache]", r.reason?.message));
};
