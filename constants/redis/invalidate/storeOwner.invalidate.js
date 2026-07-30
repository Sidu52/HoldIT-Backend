import { StoreOwnerKeys } from "../storeOwner.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

export const invalidateStoreOwnerCache = async (ownerId) => {
    const jobs = [
        deleteCache(StoreOwnerKeys.profile(ownerId)),
        deleteCache(StoreOwnerKeys.adminDetail(ownerId)),
        deleteCache(StoreOwnerKeys.stores(ownerId)),
        deleteCache(StoreOwnerKeys.dashboard(ownerId)),
        deleteCache(AdminKeys.storeOwnerDetail(ownerId)),
        deleteByPattern(AdminKeys.storeOwnerListPattern()),
    ];

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateStoreOwnerCache]", r.reason?.message));
};
