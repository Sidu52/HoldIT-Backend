import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redis from "../../services/redisService.js";
import logger from "../../utils/logger.js";
import { socketAuthMiddleware } from "./socket.middleware.js";
import { registerDriverHandlers } from "./handlers/driver.handler.js";
import { registerUserHandlers } from "./handlers/user.handler.js";
import { registerStoreHandlers } from "./handlers/store.handler.js";
import { registerAdminHandlers } from "./handlers/admin.handler.js";
import { registerSupportHandlers } from "./handlers/support.handler.js";
import { startLocationMonitor } from "./services/location.service.js";

let io;

export const initSocket = (httpServer) => {
    // Initialize Server
    io = new Server(httpServer, {
        cors: {
            origin: function (origin, callback) {
                if (!origin || origin === "undefined") {
                    return callback(null, true);
                }
                const allowedOrigins = [
                    process.env.ADMIN_URL,
                    process.env.STORE_URL,
                    "http://localhost:3000",
                    "http://localhost:3001",
                    "http://localhost:5173",
                    "http://localhost:4001",
                    "http://localhost:4000",
                    "http://localhost:8081",
                    "http://localhost:8082",
                    "http://127.0.0.1:3000",
                ].filter(Boolean);

                if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
                    callback(null, origin);
                } else {
                    callback(null, false);
                }
            },
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE"],
        },
        transports: ["websocket", "polling"],
        pingTimeout: 20000,
        pingInterval: 25000,
    });

    // Prevent MaxListenersExceededWarning
    io.sockets.setMaxListeners(20);

    // Redis Adapter Setup (Horizontal Scaling)
    try {
        const pubClient = redis.duplicate();
        const subClient = redis.duplicate();

        // Must handle duplication errors so app doesn't crash if Redis drops
        pubClient.on("error", (err) => logger.error(`[Socket:RedisAdapter:Pub] Error: ${err.message}`));
        subClient.on("error", (err) => logger.error(`[Socket:RedisAdapter:Sub] Error: ${err.message}`));

        io.adapter(createAdapter(pubClient, subClient));
        logger.info("[Socket] Redis adapter attached");
    } catch (err) {
        logger.error(`[Socket] Redis adapter failed: ${err.message}`);
    }

    // Middlewares
    io.use(socketAuthMiddleware);

    // Global Connection Handler
    io.on("connection", (socket) => {
        logger.info(`[Socket] Connected: ${socket.id} (User: ${socket.user?.id})`);

        socket.on("error", (err) => {
            logger.error(`[Socket:Error] Client ${socket.id} encountered error: ${err.message}`);
        });

        socket.on("disconnect", (reason) => {
            logger.info(`[Socket] Disconnected: ${socket.id} (Reason: ${reason})`);
        });

        // Attach domain-specific handlers
        registerDriverHandlers(io, socket);
        registerUserHandlers(io, socket);
        registerStoreHandlers(io, socket);
        registerAdminHandlers(io, socket);
        registerSupportHandlers(io, socket);
    });

    // Start Background Monitors
    startLocationMonitor(io);

    logger.info("✅ [Socket] Server Initialized on App Entrypoint");
    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized! Call initSocket first.");
    }
    return io;
};

/**
 * Shut down the io server gracefully.
 */
export const closeSocket = () => {
    if (io) {
        io.close(() => {
            logger.info("✅ [Socket] Gracefully closed");
        });
    }
};
