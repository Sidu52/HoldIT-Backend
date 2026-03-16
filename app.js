import express from "express";
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { connectMongo, disconnectMongo } from "./services/mongoService.js";
import { initRedis } from "./services/redisService.js";
import { initSocket } from "./services/socketService.js";
import { initializeWorkers } from "./workers/initializeWorkers.js";
import { syncStoresToRedis } from "./services/storeSync.js";
import { syncDriversToRedis } from "./services/driverSync.js";
import { closeQueues } from "./services/jobService.js";
import { adminSwaggerSpec, userSwaggerSpec } from "./swagger.js";

import AdminRoutes from "./routes/admin/index.js";
import UserRoutes from "./routes/users/index.js";
import DriverRoutes from "./routes/driver/index.js";
import StoreRoutes from "./routes/store/index.js";
import BulkUpload from "./routes/bulk_upload/bulk_upload.js";

const app = express();

app.use(cookieParser());

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

app.use(
    cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
        exposedHeaders: ["set-cookie"],
        maxAge: 86400,
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ROUTES
AdminRoutes(app);
DriverRoutes(app);
StoreRoutes(app);
UserRoutes(app);

// app.use("/api/v1/", BulkUpload);
app.use("/admin/api-docs", swaggerUi.serve, swaggerUi.setup(adminSwaggerSpec));
app.use("/user/api-docs", swaggerUi.serve, swaggerUi.setup(userSwaggerSpec));

// ERROR HANDLER
app.use((err, req, res, next) => {
    console.error("[Server Error]", err);
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
});

const PORT = process.env.PORT || 3000;

const start = async () => {
    await initRedis();  // connects Redis or checks eviction policy ONCE
    await connectMongo();

    // BullMQ workers (Redis is already connected above)
    initializeWorkers();

    // Sync warm caches
    await syncStoresToRedis();
    await syncDriversToRedis();

    //  HTTP server
    const server = app.listen(PORT, () => {
        console.log(`[Server] Running on port ${PORT}`);
    });

    // Socket.IO
    initSocket(server);

    // GRACEFUL SHUTDOWN
    const shutdown = async (signal) => {
        server.close(async () => {
            await Promise.allSettled([
                closeQueues(),
                disconnectMongo(),
            ]);
            console.log("[Server] Shutdown complete");
            process.exit(0);
        });

        setTimeout(() => {
            console.error("[Server] Forced exit after timeout");
            process.exit(1);
        }, 15000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
    console.error("[Server] Failed to start:", err.message);
    process.exit(1);
});