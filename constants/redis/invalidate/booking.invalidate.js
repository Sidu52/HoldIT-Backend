import { BookingKeys } from "../booking.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { DriverKeys } from "../driver.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import { invalidateStoreBookingCache } from "./store.invalidate.js";
import logger from "../../../utils/logger.js";

/**
 * Call after ANY booking mutation (status change, driver/store (re)assignment, cancellation)
 * — busts every role's cached view of this booking in one place (user, store, driver, admin, store owner).
 */
export const invalidateBookingCache = async (firstArg, secondArg = {}) => {
    let bookingId = null;
    let userId = null;
    let storeId = null;
    let driverIds = [];

    if (typeof firstArg === "object" && firstArg !== null) {
        bookingId = firstArg._id || firstArg.id || firstArg.bookingId;
        userId = firstArg.userId?._id || firstArg.userId;
        storeId = firstArg.storeId?._id || firstArg.storeId || secondArg?.storeId;
        driverIds = [
            firstArg.pickup?.assignment?.driverId,
            firstArg.delivery?.assignment?.driverId,
            ...(secondArg?.driverIds || []),
        ].filter(Boolean);
    } else {
        // String signature: invalidateBookingCache(userId, bookingId) or (bookingId, options)
        if (typeof secondArg === "string" || typeof secondArg === "object") {
            userId = firstArg;
            bookingId = typeof secondArg === "string" ? secondArg : secondArg?.bookingId;
            storeId = typeof secondArg === "object" ? secondArg?.storeId : null;
            driverIds = typeof secondArg === "object" ? (secondArg?.driverIds || []) : [];
        }
    }

    const jobs = [
        deleteByPattern(AdminKeys.bookingListPattern()),
        deleteByPattern("store_owner:dashboard:*"),
    ];

    if (bookingId) {
        jobs.push(deleteCache(AdminKeys.bookingDetail(bookingId)));
    }

    if (userId) {
        if (bookingId) {
            jobs.push(deleteCache(BookingKeys.userDetail(userId, bookingId)));
        }
        jobs.push(deleteByPattern(BookingKeys.userListPattern(userId)));
        jobs.push(deleteCache(BookingKeys.active(userId)));
        jobs.push(deleteByPattern(BookingKeys.historyPattern(userId)));
    }

    for (const driverId of driverIds.filter(Boolean)) {
        jobs.push(deleteCache(DriverKeys.activeRide(driverId.toString())));
    }

    if (storeId) {
        jobs.push(invalidateStoreBookingCache(storeId, bookingId));
    } else {
        // Broad clear for store caches to prevent stale store lists
        jobs.push(deleteByPattern("store:dashboard:*"));
        jobs.push(deleteByPattern("store:bookings_incoming:*"));
        jobs.push(deleteByPattern("store:booking_return_parcel:*"));
        jobs.push(deleteByPattern("store_bookings_active:*"));
        jobs.push(deleteByPattern("store_bookings_history:*"));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateBookingCache]", r.reason?.message));
};