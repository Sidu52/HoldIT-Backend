import logger from "../../../utils/logger.js";
import { rooms } from "../socket.rooms.js";
import { SOCKET_EVENTS } from "../socket.events.js";

// Store role constant — stores authenticate as their own entity
const STORE_ROLE = "store";

/**
 * Register store-specific socket handlers.
 * Stores are mostly passive receivers in this architecture.
 * Business logic goes through standard REST APIs.
 */
export const registerStoreHandlers = (io, socket) => {
    // Accept both store and store_owner roles
    const role = socket.user.role;
    if (role !== STORE_ROLE && role !== "store_owner") return;

    const storeId = socket.user.id;

    // Join the store's private room so it receives targeted events
    // (e.g., incoming bookings, return requests, driver arrivals)
    socket.join(rooms.store(storeId));
    logger.debug(`[Socket:Store] ${storeId} joined room ${rooms.store(storeId)}`);

    socket.on(SOCKET_EVENTS.STORE_ACKNOWLEDGE_BOOKING, async (payload) => {
        try {
            const { bookingId } = payload;
            if (!bookingId) return;
            
            logger.info(`[Socket:Store] Store ${storeId} acknowledged booking ${bookingId}`);
            
            // Forward acknowledgement to admin dashboard
            io.to(rooms.adminDashboard()).emit(SOCKET_EVENTS.ADMIN_BOOKING_STATUS, {
                bookingId,
                status: "store_acknowledged",
                storeId,
                timestamp: new Date()
            });
        } catch (err) {
            logger.error(`[Socket:Store] Acknowledge failed: ${err.message}`);
        }
    });

    socket.on("error", (err) => {
        logger.error(`[Socket:Store] error from ${storeId}: ${err.message}`);
    });
};
