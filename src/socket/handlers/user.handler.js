import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";
import { locationService } from "../services/location.service.js";
import Booking from "../../../models/Booking.js";
import { USER_ROLES } from "../../../utils/constants.js";

export const registerUserHandlers = (io, socket) => {
    const userId = socket.user.id;
    const role = socket.user.role;

    // Both User and Admin can request location
    socket.on(SOCKET_EVENTS.DRIVER_LOCATION_GET, async (payload, callback) => {
        try {
            if (role !== USER_ROLES.USER && role !== USER_ROLES.SUPER_ADMIN && role !== USER_ROLES.OPERATION_MANAGER) {
                if (typeof callback === "function") callback({ error: "Unauthorized" });
                return;
            }
            
            const { bookingId } = payload;
            if (!bookingId) {
                if (typeof callback === "function") callback({ error: "Booking ID required" });
                return;
            }

            const location = await locationService.getLocationForBooking(bookingId);
            if (typeof callback === "function") callback(location);
        } catch (error) {
            logger.error(`[Socket:User] Get location failed: ${error.message}`);
            if (typeof callback === "function") callback({ error: "Failed to locate driver" });
        }
    });

    if (role !== USER_ROLES.USER) return;

    socket.on(SOCKET_EVENTS.USER_SUBSCRIBE_BOOKING, async (payload) => {
        try {
            const { bookingId } = payload;
            // Verify ownership
            const booking = await Booking.findOne({ _id: bookingId, userId }).select("status").lean();
            if (!booking) {
                socket.emit(SOCKET_EVENTS.ERROR, { message: "Invalid booking" });
                return;
            }

            const locationRoom = rooms.driverLocation(bookingId);
            socket.join(locationRoom);
            
            // Try to fetch initial location right away
            const location = await locationService.getLocationForBooking(bookingId);

            socket.emit(SOCKET_EVENTS.USER_SUBSCRIBED_BOOKING, { 
                bookingId, 
                status: booking.status,
                driverLocation: location || null
            });
            logger.info(`[Socket:User] ${userId} subscribed to location for ${bookingId}`);
        } catch (err) {
            logger.error(`[Socket:User] Subscribe failed: ${err.message}`);
        }
    });

    socket.on(SOCKET_EVENTS.USER_UNSUBSCRIBE_BOOKING, (payload) => {
        const { bookingId } = payload;
        if (bookingId) {
            socket.leave(rooms.driverLocation(bookingId));
        }
    });
};
