import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import { markDriverAvailable, addDriverToRedis } from "../../services/driverGeoService.js";
import { ACCOUNT_STATUS, BOOKING_STATUS, STATUS_CODES } from "../../utils/constants.js";
import logger from "../../utils/logger.js";

// VERIFY STORE
export const verifyStore = (store, owner = null) => {
    if (!store) {
        return { valid: false, message: "Store not found.", code: STATUS_CODES.NOT_FOUND };
    }

    if (owner) {
        if (owner.account_status === ACCOUNT_STATUS.BLOCKED) {
            return { valid: false, message: "This store owner account has been suspended.", code: STATUS_CODES.FORBIDDEN };
        }
        if (owner.account_status === ACCOUNT_STATUS.PENDING) {
            return { valid: false, message: "This store owner account is not active. Please contact support.", code: STATUS_CODES.FORBIDDEN };
        }
        if (owner.account_status === ACCOUNT_STATUS.INACTIVE) {
            return { valid: false, message: "This store owner account is inactive. Please contact support.", code: STATUS_CODES.FORBIDDEN };
        }
    }

    if (store.account_status === ACCOUNT_STATUS.BLOCKED) {
        return { valid: false, message: "This store account has been suspended.", code: STATUS_CODES.FORBIDDEN };
    } else if (store.account_status === ACCOUNT_STATUS.PENDING) {
        return { valid: false, message: "This store account is not verified. Please contact support.", code: STATUS_CODES.FORBIDDEN };
    } else if (store.account_status === ACCOUNT_STATUS.INACTIVE) {
        return { valid: false, message: "This store account is not active. Please contact support.", code: STATUS_CODES.FORBIDDEN };
    }

    return { valid: true };
};

import { invalidateBookingCache } from "../../constants/redis/invalidate/booking.invalidate.js";
import { invalidateDriverCache } from "../../constants/redis/invalidate/driver.invalidate.js";
import { deleteCache } from "../../constants/redis/redisOperation.js";
import { DriverKeys } from "../../constants/redis/driver.keys.js";
import { BookingKeys } from "../../constants/redis/booking.keys.js";

// Called by the store (or driver on store's behalf). Completes the pickup leg.
export const processMarkStored = async (bookingId, storeId, notes) => {
    const now = new Date();

    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            status: BOOKING_STATUS.AT_STORE,
            storeId: new mongoose.Types.ObjectId(storeId),
        },
        {
            $set: {
                status: BOOKING_STATUS.STORED,
                lastStatusUpdatedAt: now,
                "storage.startedAt": now,
                "storage.storedAt": now,
                "storage.notes": notes,
            },
            $push: {
                timeline: {
                    status: BOOKING_STATUS.STORED,
                    note: notes
                        ? `Luggage accepted by store: ${notes}`
                        : "Luggage accepted and stored by store",
                    updatedBy: new mongoose.Types.ObjectId(storeId),
                    updatedByModel: "Store",
                    createdAt: now,
                },
            },
        },
        { returnDocument: "after" }
    );

    if (!booking) return null;

    // Invalidate Redis caches for store and booking
    invalidateBookingCache(booking, { storeId }).catch((err) =>
        logger.error(`[processMarkStored] Cache invalidation failed for ${bookingId}:`, err)
    );

    // Transition Driver 1 Pickup Earning to PAYABLE
    import("../../services/fundDistributionService.js")
        .then(({ updateEarningStatus }) => updateEarningStatus(bookingId, "PICKUP", "PAYABLE"))
        .catch((err) => logger.error(`[processMarkStored] Driver 1 earning update failed for ${bookingId}:`, err));

    const driverId = booking.pickup?.assignment?.driverId;

    // Release driver, if one was assigned
    if (driverId) {
        try {
            const Store = (await import("../../models/Store.js")).default;
            const storeDoc = await Store.findById(storeId).select("location service_area_id").lean();

            const driver = await Driver.findById(driverId);
            if (driver) {
                driver.is_on_trip = false;
                driver.current_booking_id = null;

                if (storeDoc?.location?.coordinates?.length >= 2) {
                    driver.currentLocation = {
                        type: "Point",
                        coordinates: storeDoc.location.coordinates,
                        updatedAt: new Date(),
                    };
                    if (!driver.service_area_id && storeDoc.service_area_id) {
                        driver.service_area_id = storeDoc.service_area_id;
                    }
                }

                await driver.save();
                await markDriverAvailable(driverId);
                await addDriverToRedis(driver);


                await Promise.allSettled([
                    deleteCache(DriverKeys.assigned(driverId)),
                    deleteCache(DriverKeys.offered(driverId)),
                    deleteCache(BookingKeys.offer(bookingId)),
                    invalidateDriverCache(driverId, bookingId),
                ]);
            }
        } catch (err) {
            logger.error(`[processMarkStored] Driver release/sync failed for ${driverId}:`, err);
        }
    }

    return booking;
};