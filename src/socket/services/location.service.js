import redis from "../../../services/redisService.js";
import Booking from "../../../models/Booking.js";
import { BOOKING_STATUS } from "../../../utils/constants.js";
import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";

const TTL_5_MINS = 5 * 60; // 5 minutes in seconds

export const locationService = {
    /**
     * Validates and updates driver location in Redis cache.
     */
    async updateDriverLocation(driverId, payload, io) {
        const { bookingId, lat, lng, heading, speed, timestamp } = payload;
        
        // 1. Validation
        if (!bookingId || lat == null || lng == null) {
            throw new Error("Invalid payload: Missing bookingId, lat, or lng");
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error("Invalid coordinates");
        }

        // 2. Verify driver owns booking & active status (DB Hit for Auth only)
        // Note: To optimize, could we cache active bookings per driver? 
        // We will hit DB lightly to ensure authorization.
        const booking = await Booking.findOne({
            _id: bookingId,
            driverId,
            status: { $in: [
                BOOKING_STATUS.DRIVER_ASSIGNED,
                BOOKING_STATUS.DRIVER_ARRIVED,
                BOOKING_STATUS.PICKED_UP,
                BOOKING_STATUS.ARRIVED_AT_STORE,
                BOOKING_STATUS.OUT_FOR_RETURN,
                BOOKING_STATUS.ARRIVED_FOR_RETURN
            ]}
        }).select("_id").lean();

        if (!booking) {
            throw new Error("Location update rejected: Invalid or inactive booking for this driver.");
        }

        const updatedAt = timestamp || Date.now();
        const locationData = { lat, lng, heading, speed, updatedAt };

        // 3. Store in Redis
        // driver:location maps driverId to location
        // booking:driver maps bookingId to driverId (for reverse lookup without DB hit)
        await Promise.all([
            redis.setex(`driver:location:${driverId}`, TTL_5_MINS, JSON.stringify(locationData)),
            redis.setex(`booking:driver:${bookingId}`, 24 * 60 * 60, driverId)
        ]);

        // 4. Broadcast to location room
        io.to(rooms.driverLocation(bookingId)).emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATED, locationData);

        // 5. Broadcast to admin dashboard
        io.to(rooms.adminDashboard()).emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATED, {
            driverId,
            bookingId,
            lat,
            lng,
            updatedAt
        });

        return locationData;
    },

    /**
     * Get location from Redis for a specific booking.
     * Never hits MongoDB.
     */
    async getLocationForBooking(bookingId) {
        const driverId = await redis.get(`booking:driver:${bookingId}`);
        if (!driverId) return null;

        const locationRaw = await redis.get(`driver:location:${driverId}`);
        if (!locationRaw) return null;

        return JSON.parse(locationRaw);
    },

    /**
     * Clear driver location (When going offline)
     */
    async clearDriverLocation(driverId) {
        await redis.del(`driver:location:${driverId}`);
    }
};

/**
 * Daemon to monitor stale driver locations globally.
 * Runs every 60 seconds across active bookings.
 */
export const startLocationMonitor = (io) => {
    setInterval(async () => {
        try {
            // Find active tracking bookings
            const activeBookings = await Booking.find({
                status: { $in: [
                    BOOKING_STATUS.DRIVER_ASSIGNED, 
                    BOOKING_STATUS.PICKED_UP, 
                    BOOKING_STATUS.OUT_FOR_RETURN
                ]}
            }).select("_id driverId status").lean();

            for (const b of activeBookings) {
                if (!b.driverId) continue;
                
                const driverId = b.driverId.toString();
                const bookingId = b._id.toString();
                
                // TTL check
                const ttl = await redis.ttl(`driver:location:${driverId}`);
                
                // If key is expired (-2) or expiring very soon (< 0 means no TTL usually)
                if (ttl < 0) {
                    io.to(rooms.adminDashboard()).emit(SOCKET_EVENTS.DRIVER_LOCATION_STALE, {
                        driverId,
                        bookingId,
                        lastSeen: "Expired",
                        status: b.status
                    });
                }
            }
        } catch (error) {
            logger.error(`[Location Monitor] Failed to check stale drivers: ${error.message}`);
        }
    }, 60000); // 60 seconds
};
