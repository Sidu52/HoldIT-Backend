import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";

/**
 * Helper to safely emit events to socket rooms without crashing.
 */
const safeEmit = (io, targetRooms, eventName, payload) => {
    try {
        if (!io) {
            logger.warn(`[SocketEmitter] 'io' instance is missing for event ${eventName}. Make sure it's initialized.`);
            return;
        }
        io.to(targetRooms).emit(eventName, payload);
    } catch (err) {
        logger.error(`[SocketEmitter] Failed to emit ${eventName}: ${err.message}`);
    }
};

export const emitBookingCreated = (io, booking) => {
    const targets = [rooms.adminDashboard(), rooms.user(booking.userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_CREATED, {
        bookingId: booking._id || booking.bookingId,
        userId: booking.userId,
        storeId: booking.storeId,
        status: booking.status,
        pickupLocation: booking.pickupLocation,
        scheduledAt: booking.scheduledAt,
        createdAt: booking.createdAt,
    });
};

export const emitBookingStoreAssigned = (io, bookingId, userId, store) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId), rooms.store(store.id || store._id)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_STORE_ASSIGNED, {
        bookingId,
        store: {
            id: store.id || store._id,
            name: store.name,
            address: store.address,
            lat: store.location?.coordinates?.[1] || store.lat,
            lng: store.location?.coordinates?.[0] || store.lng,
        }
    });
};

// booking:driver_searching
export const emitBookingDriverSearching = (io, bookingId, userId) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_DRIVER_SEARCHING, {
        bookingId,
        message: 'Finding a driver for your booking',
    });
};

export const emitBookingDriverAssigned = (io, bookingId, userId, driver) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_DRIVER_ASSIGNED, {
        bookingId,
        driver: {
            id: driver.id || driver._id,
            name: `${driver.first_name} ${driver.last_name}`,
            phone: driver.phone,
            vehicleNumber: driver.vehicle_details?.registration_number,
            currentLocation: driver.live_location,
        }
    });
};

export const emitBookingDriverArrived = (io, bookingId, userId, driverId, arrivedAt) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_DRIVER_ARRIVED, {
        bookingId,
        driverId,
        arrivedAt,
        otpSent: true,
    });
};

export const emitBookingPickedUp = (io, bookingId, userId, storeId, pickedUpAt, driverName) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId), rooms.store(storeId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_PICKED_UP, {
        bookingId,
        pickedUpAt,
        driver: { name: driverName },
    });
};

export const emitBookingArrivedAtStore = (io, bookingId, storeId, driverId, arrivedAt) => {
    const targets = [rooms.adminDashboard(), rooms.store(storeId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_ARRIVED_AT_STORE, {
        bookingId,
        driverId,
        arrivedAt,
        otpSent: true,
    });
};

export const emitBookingStored = (io, bookingId, userId, storedAt, storeName) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_STORED, {
        bookingId,
        storedAt,
        store: { name: storeName },
    });
};

export const emitBookingReturnRequested = (io, bookingId, userId, storeId, returnLocation, returnScheduledAt) => {
    const targets = [rooms.adminDashboard(), rooms.store(storeId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_RETURN_REQUESTED, {
        bookingId,
        userId,
        returnLocation,
        returnScheduledAt,
    });
};

export const emitBookingReturnDriverAssigned = (io, bookingId, userId, driver) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_RETURN_DRIVER_ASSIGNED, {
        bookingId,
        driver: {
            id: driver.id || driver._id,
            name: `${driver.first_name} ${driver.last_name}`,
            phone: driver.phone,
            vehicleNumber: driver.vehicle_details?.registration_number,
        }
    });
};

export const emitBookingOutForReturn = (io, bookingId, userId, driverId, pickedFromStoreAt) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_OUT_FOR_RETURN, {
        bookingId,
        driverId,
        pickedFromStoreAt,
    });
};

export const emitBookingArrivedForDelivery = (io, bookingId, userId, driverId, arrivedAt) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_ARRIVED_FOR_DELIVERY, {
        bookingId,
        driverId,
        arrivedAt,
        otpSent: true,
    });
};

export const emitBookingDelivered = (io, bookingId, userId, storeId, deliveredAt, driverName) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId), rooms.store(storeId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_DELIVERED, {
        bookingId,
        deliveredAt,
        driver: { name: driverName },
    });
};

export const emitBookingCancelled = (io, bookingId, userId, storeId = null, driverId = null, cancelledBy, reason, cancelledAt) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    if (storeId) targets.push(rooms.store(storeId));
    if (driverId) targets.push(rooms.driver(driverId));

    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_CANCELLED, {
        bookingId,
        cancelledBy,
        reason,
        cancelledAt,
    });
};

export const emitBookingNoDriverAvailable = (io, bookingId, userId) => {
    const targets = [rooms.adminDashboard(), rooms.user(userId)];
    safeEmit(io, targets, SOCKET_EVENTS.BOOKING_NO_DRIVER, {
        bookingId,
        message: 'No driver available. Please try again.',
    });
};
