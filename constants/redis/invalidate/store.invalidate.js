
import { StoreKeys } from "../store.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { StoreOwnerKeys } from "../storeOwner.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";


export const invalidateStoreCache = async (storeId, { storeOwnerId } = {}) => {
    const jobs = [
        deleteCache(StoreKeys.detail(storeId)),
        deleteCache(StoreKeys.profile(storeId)),
        deleteCache(StoreKeys.availability(storeId)),
        deleteCache(StoreKeys.publicView(storeId)),
        deleteCache(AdminKeys.storeDetail(storeId)),
        deleteByPattern(AdminKeys.storeListPattern()),
        deleteByPattern("stores_search:*"),
        deleteByPattern("stores_nearby:*"),
        deleteByPattern("nearest_stores:*"),
    ];

    if (storeOwnerId) {
        // this store's counts/status feed into the owner's admin composed view
        jobs.push(deleteCache(StoreOwnerKeys.adminDetail(storeOwnerId)));
        jobs.push(deleteByPattern(AdminKeys.storeOwnerListPattern()));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateStoreCache]", r.reason?.message));
};

export const invalidateStoreBookingCache = async (storeId, bookingId = null) => {
    const keys = [
        StoreKeys.bookingIncoming(storeId),
        StoreKeys.bookingSummary(storeId),
        StoreKeys.dashboard(storeId),
    ];
    if (bookingId) keys.push(StoreKeys.bookingDetail(storeId, bookingId));

    const patterns = [
        StoreKeys.bookingActiveByStorePattern(storeId),
        StoreKeys.bookingHistoryByStorePattern(storeId),
    ];

    return invalidate({ keys, patterns });
};