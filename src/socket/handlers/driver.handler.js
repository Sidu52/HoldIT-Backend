import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { locationService } from "../services/location.service.js";
import { emitAdminDriverStatusChanged } from "../emitters/driver.emitter.js";
import { emitBookingDriverAssigned } from "../emitters/booking.emitter.js";
import { getOfferStatus } from "../../../helpers/user/driverAssignHelper.js";
import { processRideAccept, processRideReject } from "../../../helpers/driver/driverRideHelper.js";
import { STATUS_CODES, USER_ROLES } from "../../../utils/constants.js";
import Driver from "../../../models/Driver.js";
import { addDriverToRedis } from "../../../services/driverGeoService.js";

export const registerDriverHandlers = (io, socket) => {
    const driverId = socket.user.id;
    const driverRole = socket.user.role;

    if (driverRole !== USER_ROLES.DRIVER) return;

    logger.info(`[Socket:Driver] Driver ${driverId} connected`);

    // 1. Location Update (Main handler for real-time tracking)
    socket.on(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, async (payload) => {
        try {
            const result = await locationService.updateDriverLocation(driverId, payload, io);

            // Also broadcast to specific driver location room for targeted updates
            io.to(payload.bookingId ? `location:${payload.bookingId}` : "")
                .emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATED, {
                    driverId,
                    ...result,
                    bookingId: payload.bookingId,
                });

            logger.debug(`[Socket:Driver] Location update successful for ${driverId}`, {
                lat: payload.lat,
                lng: payload.lng,
                bookingId: payload.bookingId,
            });
        } catch (err) {
            logger.warn(`[Socket:Driver] Location update failed for ${driverId}: ${err.message}`);
            socket.emit(SOCKET_EVENTS.ERROR, {
                message: err.message,
                code: "LOCATION_UPDATE_FAILED",
            });
        }
    });

    // 2. Go Online
    socket.on(SOCKET_EVENTS.DRIVER_GO_ONLINE, async (payload) => {
        try {
            const driver = await Driver.findByIdAndUpdate(
                driverId,
                {
                    is_online: true,
                    currentLocation: {
                        type: "Point",
                        coordinates: [payload.lng, payload.lat]
                    }
                },
                { new: true }
            );
            if (driver) {
                await addDriverToRedis(driver);
                emitAdminDriverStatusChanged(io, driverId, `${driver.first_name} ${driver.last_name}`, true, driver.is_on_trip, payload);
                logger.info(`[Socket:Driver] Driver ${driverId} went online`);
            }
        } catch (err) {
            logger.error(`[Socket:Driver] Go Online failed: ${err.message}`);
            socket.emit(SOCKET_EVENTS.ERROR, {
                message: "Failed to go online",
                code: "GO_ONLINE_FAILED",
            });
        }
    });

    // 3. Go Offline
    socket.on(SOCKET_EVENTS.DRIVER_GO_OFFLINE, async (callback) => {
        try {
            const driver = await Driver.findById(driverId).select("is_on_trip");
            if (driver?.is_on_trip) {
                if (typeof callback === "function") callback({ error: "Cannot go offline while on an active trip." });
                logger.warn(`[Socket:Driver] Driver ${driverId} tried to go offline while on trip`);
                return;
            }

            await Driver.findByIdAndUpdate(driverId, { is_online: false });
            await locationService.clearDriverLocation(driverId);
            emitAdminDriverStatusChanged(io, driverId, null, false, false, null);

            if (typeof callback === "function") callback({ success: true });
            logger.info(`[Socket:Driver] Driver ${driverId} went offline`);
        } catch (err) {
            logger.error(`[Socket:Driver] Go Offline failed: ${err.message}`);
            if (typeof callback === "function") callback({ error: "Failed to go offline" });
        }
    });

    // 4. Accept Ride
    socket.on(SOCKET_EVENTS.DRIVER_BOOKING_ACCEPT, async (payload) => {
        try {
            const { bookingId } = payload;
            const { exists, offer } = await getOfferStatus(bookingId);

            if (!exists || offer.status === "accepted" || offer.driverId !== driverId) {
                socket.emit(SOCKET_EVENTS.ERROR, { message: "Offer expired or invalid." });
                logger.warn(`[Socket:Driver] Invalid offer acceptance: ${bookingId}`);
                return;
            }

            const { success, booking } = await processRideAccept(bookingId, driverId);

            if (!success) {
                socket.emit(SOCKET_EVENTS.ERROR, { message: "Ride no longer available." });
                logger.warn(`[Socket:Driver] Ride no longer available: ${bookingId}`);
                return;
            }

            socket.emit(SOCKET_EVENTS.DRIVER_BOOKING_ACCEPTED, { bookingId: booking._id, status: booking.status });

            // Note: Since this mimics the controller, we trigger the user/admin emitters here too
            const driverData = await Driver.findById(driverId).select("first_name last_name phone vehicle_details live_location");
            emitBookingDriverAssigned(io, bookingId, booking.userId.toString(), driverData);

            logger.info(`[Socket:Driver] Driver ${driverId} accepted booking ${bookingId}`);
        } catch (err) {
            logger.error(`[Socket:Driver] Accept Ride failed: ${err.message}`);
            socket.emit(SOCKET_EVENTS.ERROR, { message: "Failed to accept ride." });
        }
    });

    // 5. Reject Ride
    socket.on(SOCKET_EVENTS.DRIVER_BOOKING_REJECT, async (payload) => {
        try {
            const { bookingId, reason } = payload;
            await processRideReject(bookingId, driverId, reason || "Socket Reject");
            socket.emit(SOCKET_EVENTS.DRIVER_BOOKING_REJECTED, { bookingId });
            logger.info(`[Socket:Driver] Driver ${driverId} rejected booking ${bookingId}`);
        } catch (err) {
            logger.error(`[Socket:Driver] Reject Ride failed: ${err.message}`);
        }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        logger.info(`[Socket:Driver] Driver ${driverId} disconnected`);
    });

    socket.on("error", (err) => {
        logger.error(`[Socket:Driver] Error from driver ${driverId}: ${err.message}`);
    });
};
