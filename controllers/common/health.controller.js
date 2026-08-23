import mongoose from "mongoose";
import { redisClient } from "../../services/redisService.js";
import logger from "../../utils/logger.js";

/**
 * Deep health check controller for cloud load balancers (AWS ALB, Render, GCP, Docker).
 * Checks database connection, Redis ping, memory usage, and server uptime.
 */
export const getHealthStatus = async (req, res) => {
    const startTime = Date.now();

    // 1. Check MongoDB status (1 = connected)
    const mongoState = mongoose.connection.readyState;
    const isMongoHealthy = mongoState === 1;

    // 2. Check Redis status
    let isRedisHealthy = false;
    let redisLatencyMs = null;
    try {
        const pingStart = Date.now();
        const pong = await redisClient.ping();
        redisLatencyMs = Date.now() - pingStart;
        isRedisHealthy = pong === "PONG";
    } catch (err) {
        logger.error(`[HealthCheck] Redis ping failed: ${err.message}`);
        isRedisHealthy = false;
    }

    const isHealthy = isMongoHealthy && isRedisHealthy;
    const responseTimeMs = Date.now() - startTime;

    const memoryUsage = process.memoryUsage();

    const healthReport = {
        status: isHealthy ? "OK" : "DEGRADED",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        responseTimeMs,
        services: {
            database: {
                status: isMongoHealthy ? "UP" : "DOWN",
                stateCode: mongoState,
            },
            cache: {
                status: isRedisHealthy ? "UP" : "DOWN",
                latencyMs: redisLatencyMs,
            },
        },
        system: {
            memory: {
                rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
                heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            },
            nodeVersion: process.version,
            env: process.env.NODE_ENV || "development",
        },
    };

    const statusCode = isHealthy ? 200 : 503;
    return res.status(statusCode).json(healthReport);
};
