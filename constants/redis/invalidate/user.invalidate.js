import { UserKeys } from "../user.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

export const invalidateUserCache = async (userId) => {
    const jobs = [
        deleteCache(UserKeys.profile(userId)),
        deleteCache(UserKeys.addressList(userId)),
        deleteByPattern(UserKeys.addressList(userId) + "*"), // Invalidate details
        deleteCache(AdminKeys.userDetail(userId)),
        deleteByPattern(AdminKeys.userListPattern()),
    ];

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateUserCache]", r.reason?.message));
};
