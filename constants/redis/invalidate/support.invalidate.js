import { SupportKeys } from "../support.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

export const invalidateSupportCache = async (userId, ticketId = null) => {
    const jobs = [
        deleteByPattern(SupportKeys.listPattern(userId)),
    ];

    if (ticketId) {
        jobs.push(deleteCache(SupportKeys.detail(userId, ticketId)));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateSupportCache]", r.reason?.message));
};
