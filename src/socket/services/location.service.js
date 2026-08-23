import mongoose from "mongoose";
import Booking from "../../../models/Booking.js";
import Driver from "../../../models/Driver.js";
import { BOOKING_STATUS } from "../../../utils/constants.js";
import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";
import { BookingKeys, BookingTTL } from "../../../constants/redis/booking.keys.js";
import { DriverKeys, DriverTTL } from "../../../constants/redis/driver.keys.js";
import {
    getCache,
    setCache,
    deleteCache,
    getTTL,
    cacheAside,
    acquireLock,
} from "../../../constants/redis/redisOperation.js";

// Statuses where a driver is actively in transit (location tracking makes sense)
const TRACKING_STATUSES = [
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED,
    BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.AT_STORE,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
    BOOKING_STATUS.OUT_FOR_RETURN,
    BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
];

export const locationService = {
    async updateDriverLocation(driverId, payload, io) {
        const { bookingId, lat, lng, heading, speed, timestamp } = payload;

        // Validation
        if (!bookingId || lat == null || lng == null) {
            throw new Error("Invalid payload: Missing bookingId, lat, or lng");
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error("Invalid coordinates");
        }

        // Verify driver owns booking & active status (Redis First via cacheAside)
        const authCacheKey = BookingKeys.activeDriver(bookingId);
        const cachedDriverId = await cacheAside(authCacheKey, BookingTTL.ACTIVE_DRIVER, async () => {
            const driverObjectId = new mongoose.Types.ObjectId(driverId);
            const booking = await Booking.findOne({
                _id: bookingId,
                $or: [
                    { "pickup.assignment.driverId": driverObjectId },
                    { "delivery.assignment.driverId": driverObjectId },
                ],
                status: { $in: TRACKING_STATUSES },
            }).select("_id").lean();

            return booking ? driverId : null;
        });

        if (cachedDriverId !== driverId) {
            throw new Error("Location update rejected: Invalid or inactive booking for this driver.");
        }

        const updatedAt = timestamp || Date.now();
        const locationData = { lat, lng, heading, speed, updatedAt };

        // Store in Redis via setCache helper
        await Promise.all([
            setCache(DriverKeys.location(driverId), locationData, DriverTTL.LOCATION),
            setCache(BookingKeys.driverForBooking(bookingId), driverId, BookingTTL.DRIVER_FOR_BOOKING),
        ]);

        // Keep Redis Geo & Driver MongoDB coordinates updated with live coordinates
        import("../../../services/driverGeoService.js")
            .then(({ updateDriverLocation }) => updateDriverLocation(driverId, lng, lat))
            .catch(() => {});

        Driver.updateOne(
            { _id: driverId },
            {
                $set: {
                    "currentLocation.type": "Point",
                    "currentLocation.coordinates": [lng, lat],
                    "currentLocation.updatedAt": new Date(),
                    last_active_at: new Date(),
                },
            }
        ).catch(() => {});

        // Broadcast to location room
        io.to(rooms.driverLocation(bookingId)).emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATED, locationData);

        // Broadcast to admin dashboard
        io.to(rooms.adminDashboard()).emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATED, {
            driverId,
            bookingId,
            lat,
            lng,
            updatedAt,
        });

        return locationData;
    },

    async getLocationForBooking(bookingId) {
        const driverId = await getCache(BookingKeys.driverForBooking(bookingId));
        if (!driverId) return null;

        return await getCache(DriverKeys.location(driverId));
    },

    async clearDriverLocation(driverId) {
        await deleteCache(DriverKeys.location(driverId));
    },
};

/**
 * Daemon to monitor stale driver locations globally.
 * Runs every 60 seconds across active bookings.
 */
export const startLocationMonitor = (io) => {
    setInterval(async () => {
        try {
            // Redis lock to prevent multiple node instances from running this concurrently
            const lock = await acquireLock("lock:location_monitor", 55);
            if (!lock) return;

            // Find active tracking bookings using correct field paths
            const activeBookings = await Booking.find({
                status: { $in: TRACKING_STATUSES },
                isActive: true,
            })
                .select("_id pickup.assignment.driverId delivery.assignment.driverId status")
                .lean();

            for (const b of activeBookings) {
                // Get the active driver for this booking
                const driverId = (
                    b.delivery?.assignment?.driverId ||
                    b.pickup?.assignment?.driverId
                );
                if (!driverId) continue;

                const driverIdStr = driverId.toString();
                const bookingId = b._id.toString();

                // TTL check via getTTL helper
                const ttl = await getTTL(DriverKeys.location(driverIdStr));

                // If key is expired (-2) or doesn't exist
                if (ttl < 0) {
                    io.to(rooms.adminDashboard()).emit(SOCKET_EVENTS.DRIVER_LOCATION_STALE, {
                        driverId: driverIdStr,
                        bookingId,
                        lastSeen: "Expired",
                        status: b.status,
                    });
                }
            }
        } catch (error) {
            logger.error(`[Location Monitor] Failed to check stale drivers: ${error.message}`);
        }
    }, 60000); // 60 seconds
};
