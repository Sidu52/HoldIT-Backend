import jwt from "jsonwebtoken";
import logger from "../../utils/logger.js";
import { SOCKET_EVENTS } from "./socket.events.js";
import { rooms } from "./socket.rooms.js";
import { USER_ROLES } from "../../utils/constants.js";

/**
 * Helper to parse cookies from a string
 */
const parseCookies = (cookieString) => {
    if (!cookieString) return {};
    return cookieString.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.split("=").map((c) => c.trim());
        if (key && value) acc[key] = decodeURIComponent(value);
        return acc;
    }, {});
};

/**
 * Validates JWT token on incoming socket connections
 * and attaches decoded user to socket.user.
 */
export const socketAuthMiddleware = async (socket, next) => {
    try {
        // 1. Check auth object (passed manually)
        // 2. Check authorization header
        // 3. Check cookies (for web clients with withCredentials: true)
        let tokenRaw = socket.handshake.auth?.token || socket.handshake.headers?.authorization;

        if (!tokenRaw) {
            const cookies = parseCookies(socket.handshake.headers?.cookie);
            tokenRaw = cookies.accessToken || cookies.admin_accessToken;
        }

        if (!tokenRaw) {
            logger.warn(`[Socket] Unauthorized attempt from ${socket.id} | No token provided`);
            return next(new Error("UNAUTHORIZED"));
        }

        const token = tokenRaw.replace(/^Bearer\s+/, "");
        if (!token) {
            return next(new Error("UNAUTHORIZED"));
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        // Attach user info to socket
        socket.user = {
            id: decoded._id || decoded.auth_id,
            role: decoded.role,
        };

        logger.info(`[Socket] Authorized connection | Role: ${socket.user.role} | ID: ${socket.user.id} | Socket: ${socket.id}`);

        // --- Auto Room Join on Connect ---
        const { role, id } = socket.user;

        if (role === USER_ROLES.USER) {
            socket.join(rooms.user(id));
        } else if (role === USER_ROLES.DRIVER) {
            socket.join(rooms.driver(id));
        } else if (role === USER_ROLES.STORE_OWNER || role === USER_ROLES.STORE) {
            socket.join(rooms.store(id));
        } else if (role === USER_ROLES.SUPER_ADMIN || role === USER_ROLES.OPERATION_MANAGER) {
            socket.join(rooms.adminDashboard());
        }

        next();
    } catch (error) {
        logger.error(`[Socket] Auth failed (${socket.id}): ${error.message}`);
        next(new Error("UNAUTHORIZED"));
    }
};
