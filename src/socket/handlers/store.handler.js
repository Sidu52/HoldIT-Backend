import logger from "../../../utils/logger.js";
import { rooms } from "../socket.rooms.js";

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

    socket.on("error", (err) => {
        logger.error(`[Socket:Store] error from ${storeId}: ${err.message}`);
    });
};
