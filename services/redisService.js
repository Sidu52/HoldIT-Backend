import Redis from "ioredis";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config();

// CONFIGURATION
const getRedisConfig = () => {
    if (process.env.REDIS_URL) {
        return {
            url: process.env.REDIS_URL,
            maxRetriesPerRequest: null,
            ...(process.env.REDIS_TLS === "true" && {
                tls: { rejectUnauthorized: false },
            }),
        };
    }

    // Individual params
    if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
        logger.error("Either REDIS_URL or (REDIS_HOST + REDIS_PORT) must be defined in .env");
        process.exit(1);
    }

    return {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
        ...(process.env.REDIS_TLS === "true" && {
            tls: { rejectUnauthorized: false },
        }),
    };
};

// EXPORTED CONFIG (used by BullMQ workers)
export const redisConnectionConfig = getRedisConfig();

// CREATE REDIS INSTANCE
const createRedisClient = (config, label = "Redis") => {
    let client;

    if (config.url) {
        client = new Redis(config.url, {
            maxRetriesPerRequest: config.maxRetriesPerRequest,
            tls: config.tls,
            lazyConnect: true,
            connectTimeout: 10000,
            retryStrategy(times) {
                if (times % 10 === 0) {
                    logger.warn(`[${label}] Reconnecting... Attempt #${times}`);
                }
                return Math.min(times * 500, 5000);
            },
        });
    } else {
        client = new Redis({
            ...config,
            lazyConnect: true,
            connectTimeout: 10000,
            retryStrategy(times) {
                if (times % 10 === 0) {
                    logger.warn(`[${label}] Reconnecting... Attempt #${times}`);
                }
                return Math.min(times * 500, 5000);
            },
        });
    }

    // Events
    client.on("connect", () => logger.info(`[${label}] Connected`));
    client.on("ready", () => logger.info(`[${label}] Ready`));
    client.on("error", (err) => logger.error(`[${label}] Error:`, err.message));
    client.on("reconnecting", () => logger.info(`[${label}] Reconnecting...`));
    client.on("close", () => logger.warn(`[${label}] Connection closed`));

    return client;
};

// Main Redis instance
const redis = createRedisClient(redisConnectionConfig, "Redis");


// Shared connection for ALL Queue instances
export const sharedQueueConnection = createRedisClient(
    { ...redisConnectionConfig, enableReadyCheck: false },
    "Shared Queue"
);

// Shared connection for ALL Workers
export const sharedWorkerConnection = createRedisClient(
    { ...redisConnectionConfig, enableReadyCheck: false },
    "Shared Worker"
);

// BULLMQ CONNECTION FACTORY
export const createBullConnection = (label = "BullMQ") => {
    return createRedisClient(redisConnectionConfig, label);
};

// INITIALIZATION
export const initRedis = async () => {
    try {
        await redis.connect();
        await redis.ping();
        logger.info("[Redis] Connection verified (PONG)");
    } catch (err) {
        logger.error("[Redis] Initialization failed:", err.message);
        process.exit(1);
    }
};

export const redisClient = redis;
export default redis;