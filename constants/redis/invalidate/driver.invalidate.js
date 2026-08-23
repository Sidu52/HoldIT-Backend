import { DriverKeys } from "../driver.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

export const invalidateDriverCache = async (driverId, bookingId = null) => {
    const jobs = [
        deleteCache(DriverKeys.profile(driverId)),
        deleteCache(DriverKeys.publicView(driverId)),
        deleteCache(DriverKeys.assigned(driverId)),
        deleteCache(DriverKeys.active(driverId)),
        deleteCache(DriverKeys.activeRide(driverId)),
        deleteByPattern(DriverKeys.rideHistoryPattern(driverId)),
        deleteByPattern(DriverKeys.reviewsPattern(driverId)),
        deleteCache(AdminKeys.driverDetail(driverId)),
        deleteByPattern(AdminKeys.driverListPattern()),
    ];

    if (bookingId) {
        jobs.push(deleteCache(DriverKeys.rideDetail(driverId, bookingId)));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateDriverCache]", r.reason?.message));
};
