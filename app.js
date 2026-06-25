import express from "express";
import dotenv from "dotenv";
dotenv.config();

// Config
import { validateEnv } from "./config/env.validation.js";
validateEnv();

// Middleware
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import logger from "./utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Services
import { connectMongo, disconnectMongo } from "./services/mongoService.js";
import { initRedis } from "./services/redisService.js";
import { initSocket, closeSocket } from "./src/socket/index.js";
import { initializeWorkers, closeAllWorkers } from "./workers/initializeWorkers.js";
import { syncStoresToRedis } from "./services/storeSync.js";
import { syncDriversToRedis } from "./services/driverSync.js";
import { closeQueues } from "./services/jobService.js";
import { setupSwagger } from "./swagger.routes.js";
import { validateObjectIdParams, enforcePaginationLimit } from "./middlewares/safety.middleware.js";

// Routes
import CommonRoutes from "./routes/common.route.js";
import AdminRoutes from "./routes/admin/index.js";
import UserRoutes from "./routes/users/index.js";
import DriverRoutes from "./routes/driver/index.js";
import StoreRoutes from "./routes/store/index.js";
import StoreOwnerRoutes from "./routes/store_owner/index.js";

const app = express();

app.use(cookieParser());

// Helmet
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// CORS
app.use(
    cors({
        origin: function (origin, callback) {
            console.log("Incoming origin:", origin, "| Allowed:", process.env.CLIENT_URL);
            if (!origin) return callback(null, true);

            const allowedOrigins = [
                "http://localhost:4000",
                "http://localhost:4001",
                "http://localhost:3000",
                "http://localhost:3001",
                process.env.CLIENT_URL
            ].filter(Boolean);

            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        credentials: true,
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Safety Interceptors
app.use(validateObjectIdParams);
app.use(enforcePaginationLimit);

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// ROUTES
CommonRoutes(app);
AdminRoutes(app);
DriverRoutes(app);
StoreRoutes(app);
UserRoutes(app);
StoreOwnerRoutes(app);

setupSwagger(app);

// ERROR HANDLER
app.use((err, req, res, next) => {
    logger.error(`[Server Error] ${err.message}`, { stack: err.stack, path: req.path });
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
});

const PORT = process.env.PORT || 3000;

const start = async () => {
    await initRedis();
    await connectMongo();

    // BullMQ workers
    initializeWorkers();

    // Sync warm caches
    await syncStoresToRedis();
    await syncDriversToRedis();

    //  HTTP server
    const server = app.listen(PORT, () => {
        logger.info(`[Server] Running on port ${PORT}`);
    });

    // Socket.IO
    initSocket(server);

    // GRACEFUL SHUTDOWN
    const shutdown = async (signal) => {
        logger.info(`[Server] Received ${signal}. Shutting down gracefully...`);
        server.close(async () => {
            closeSocket();
            await Promise.allSettled([
                closeAllWorkers(),
                closeQueues(),
                disconnectMongo(),
            ]);
            logger.info("[Server] Shutdown complete");
            process.exit(0);
        });

        setTimeout(() => {
            logger.error("[Server] Forced exit after timeout");
            process.exit(1);
        }, 15000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
    logger.error(`[Server] Failed to start: ${err.message}`, { stack: err.stack });
    process.exit(1);
});