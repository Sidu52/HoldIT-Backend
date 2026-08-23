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

// Payment
import { initRazorpay } from "./config/razorpay.js";

// Services
import { connectMongo, disconnectMongo } from "./services/mongoService.js";
import { initRedis } from "./services/redisService.js";
import { initSocket, closeSocket } from "./src/socket/index.js";
import { initializeWorkers, closeAllWorkers } from "./workers/initializeWorkers.js";
import { initCronJobs, stopCronJobs } from "./services/cronJobs.js";
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
import PaymentRoutes from "./routes/payment/index.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.js";

const app = express();

// Trust proxy (required for AWS ALB / Cloudflare / Nginx reverse proxy header resolution)
app.set("trust proxy", 1);

app.use(requestIdMiddleware);
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
            // If origin is undefined (e.g. mobile app, server-to-server, or tool), allow it
            if (!origin || origin === "undefined") {
                return callback(null, true);
            }
            const allowedOrigins = [
                process.env.ADMIN_URL,
                process.env.STORE_URL,
                "http://localhost:5173",
                "http://localhost:4001",
                "http://localhost:4000",
                "http://localhost:8081",
                "http://localhost:8082",
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

app.use((req, res, next) => {
    if (req.originalUrl === "/api/v1/payments/webhook") {
        return next();
    }
    express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
});

// Global Safety Interceptors
app.use(validateObjectIdParams);
app.use(enforcePaginationLimit);

// Serve static files with subfolder fallbacks
app.use("/uploads/pickup", express.static(path.join(__dirname, "public/uploads/pickup")));
app.use("/uploads/pickup", express.static(path.join(__dirname, "public/uploads"))); // fallback for legacy uploads
app.use("/uploads/delivery", express.static(path.join(__dirname, "public/uploads/delivery")));
app.use("/uploads/delivery", express.static(path.join(__dirname, "public/uploads"))); // fallback for legacy uploads
app.use("/uploads/storage", express.static(path.join(__dirname, "public/uploads/storage")));
app.use("/uploads/storage", express.static(path.join(__dirname, "public/uploads"))); // fallback for legacy uploads
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// ROUTES
CommonRoutes(app);
AdminRoutes(app);
DriverRoutes(app);
StoreRoutes(app);
UserRoutes(app);
StoreOwnerRoutes(app);
PaymentRoutes(app);

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
     await initRazorpay();

    // BullMQ workers
    initializeWorkers();

    // Cron jobs (nightly drivers + stores offline)
    initCronJobs();

    //  HTTP server bind port FIRST so Render/health checks succeed immediately
    const server = app.listen(PORT, () => {
        logger.info(`[Server] Running on port ${PORT}`);
    });

    // Socket.IO
    initSocket(server);

    // Sync warm caches in background (non-blocking)
    Promise.all([syncStoresToRedis(), syncDriversToRedis()])
        .then(() => logger.info("[Server] Background cache sync complete"))
        .catch((err) => logger.error("[Server] Background cache sync failed:", err.message));

    // GRACEFUL SHUTDOWN
    const shutdown = async (signal) => {
        logger.info(`[Server] Received ${signal}. Shutting down gracefully...`);
        server.close(async () => {
            closeSocket();
            stopCronJobs();
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