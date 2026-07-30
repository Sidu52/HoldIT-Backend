import { AdminKeys } from "../admin.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

export const invalidateAdminDashboardCache = async () => {
    const jobs = [
        deleteCache(AdminKeys.dashboardSummary()),
        deleteByPattern(AdminKeys.dashboardSummary() + "*"), // Includes charts
    ];

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateAdminDashboardCache]", r.reason?.message));
};
