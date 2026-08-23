import { StoreKeys } from "../store.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { StoreOwnerKeys } from "../storeOwner.keys.js";
import { deleteCache, deleteByPattern, invalidate } from "../redisOperation.js";
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
        jobs.push(deleteCache(StoreOwnerKeys.adminDetail(storeOwnerId)));
        jobs.push(deleteCache(StoreOwnerKeys.dashboard(storeOwnerId)));
        jobs.push(deleteByPattern(AdminKeys.storeOwnerListPattern()));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateStoreCache]", r.reason?.message));
};

export const invalidateStoreBookingCache = async (storeId, bookingId = null) => {
    if (!storeId) return null;
    const strStoreId = storeId.toString();

    const keys = [
        StoreKeys.bookingIncoming(strStoreId),
        StoreKeys.bookingReturnParcel(strStoreId),
        StoreKeys.bookingSummary(strStoreId),
        StoreKeys.dashboard(strStoreId),
    ];
    if (bookingId) keys.push(StoreKeys.bookingDetail(strStoreId, bookingId.toString()));

    const patterns = [
        StoreKeys.bookingActiveByStorePattern(strStoreId),
        StoreKeys.bookingHistoryByStorePattern(strStoreId),
        `store_bookings_active:*${strStoreId}*`,
        `store_bookings_history:*${strStoreId}*`,
        `store_owner:dashboard:*`,
    ];

    return invalidate({ keys, patterns });
};