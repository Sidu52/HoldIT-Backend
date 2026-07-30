import { BookingKeys } from "../booking.keys.js";
import { AdminKeys } from "../admin.keys.js";
import { DriverKeys } from "../driver.keys.js";
import { deleteCache, deleteByPattern } from "../redisOperation.js";
import logger from "../../../utils/logger.js";

/**
 * Call after ANY booking mutation (status change, driver/store (re)assignment,
 * cancellation) — busts every role's cached view of this booking in one place.
 */
export const invalidateBookingCache = async (booking, { driverIds = [], storeId } = {}) => {
    const jobs = [
        deleteCache(AdminKeys.bookingDetail(booking._id)),
        deleteByPattern(AdminKeys.bookingListPattern()),
        deleteCache(BookingKeys.userDetail(booking.userId, booking._id)),
        deleteByPattern(BookingKeys.userListPattern(booking.userId)),
    ];

    for (const driverId of driverIds.filter(Boolean)) {
        jobs.push(deleteCache(DriverKeys.activeRide(driverId)));
    }
    if (storeId) {
        jobs.push(deleteCache(BookingKeys.storeDetail(storeId, booking._id)));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === "rejected" && logger.warn("[invalidateBookingCache]", r.reason?.message));
};