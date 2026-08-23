import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";

const safeEmit = (io, targetRooms, eventName, payload) => {
    try {
        if (!io) {
            logger.warn(`[SocketEmitter] 'io' instance is missing for event ${eventName}`);
            return;
        }
        io.to(targetRooms).emit(eventName, payload);
    } catch (err) {
        logger.error(`[SocketEmitter] Failed to emit ${eventName}: ${err.message}`);
    }
};

export const emitAdminDriverStatusChanged = (io, driverId, name, is_online, is_on_trip, location = null) => {
    safeEmit(io, rooms.adminDashboard(), SOCKET_EVENTS.ADMIN_DRIVER_STATUS, {
        driverId,
        name,
        is_online,
        is_on_trip,
        location,
    });
};

export const emitAdminDriverLocationUpdated = (io, driverId, location) => {
    safeEmit(io, rooms.adminDashboard(), SOCKET_EVENTS.DRIVER_LOCATION_UPDATED, {
        driverId,
        ...location,
    });
};

export const emitAdminBookingStatusChanged = (io, bookingId, oldStatus, newStatus, changedAt, changedBy) => {
    safeEmit(io, rooms.adminDashboard(), SOCKET_EVENTS.ADMIN_BOOKING_STATUS, {
        bookingId,
        oldStatus,
        newStatus,
        changedAt,
        changedBy,
    });
};

export const emitAdminAlertNoDriver = (io, bookingId, userId, pickupLocation, attempts, waitingFor) => {
    safeEmit(io, rooms.adminDashboard(), SOCKET_EVENTS.ADMIN_ALERT_NO_DRIVER, {
        bookingId,
        userId,
        pickupLocation,
        attempts,
        waitingFor,
    });
};

export const emitDriverNewOffer = (io, driverId, offerData) => {
    console.log("OFFER DATA: ", offerData);
    safeEmit(io, rooms.driver(driverId), SOCKET_EVENTS.DRIVER_NEW_OFFER, offerData);
};

export const emitDriverOfferRemoved = (io, driverId, payload) => {
    safeEmit(io, rooms.driver(driverId), SOCKET_EVENTS.DRIVER_OFFER_REMOVED, payload);
};
