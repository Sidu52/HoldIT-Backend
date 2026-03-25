import logger from "../../../utils/logger.js";
import { USER_ROLES } from "../../../utils/constants.js";

// Stores are mostly passive receivers in this architecture.
// Business logic goes through standard REST APIs.
export const registerStoreHandlers = (io, socket) => {
    if (socket.user.role !== USER_ROLES.STORE_OWNER) return;

    // Optional: Add basic store health check ping or heartbeat if required later.
    // For now, connections auto-join room store:{storeId} gracefully.
    
    socket.on("error", (err) => {
        logger.error(`[Socket:Store] error from ${socket.user.id}: ${err.message}`);
    });
};
