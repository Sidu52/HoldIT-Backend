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
                if (times > 10) {
                    logger.error(`[${label}] Max reconnection attempts reached`);
                    return null;
                }
                return Math.min(times * 200, 5000);
            },
        });
    } else {
        client = new Redis({
            ...config,
            lazyConnect: true,
            connectTimeout: 10000,
            retryStrategy(times) {
                if (times > 10) {
                    logger.error(`[${label}] Max reconnection attempts reached`);
                    return null;
                }
                return Math.min(times * 200, 5000);
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


// Shared connection for ALL Queue instances (not workers)
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
// Each BullMQ Queue/Worker needs its own connection
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

// BASIC OPERATIONS
const normalizeTTL = (ttl) => {
    const parsed = Number(ttl);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const get = async (key) => {
    if (!key) throw new Error("Redis GET: key is required");
    return redis.get(key);
};

export const set = async (key, value, ttl = null) => {
    if (!key || value === undefined || value === null) {
        throw new Error("Redis SET: key and value are required");
    }
    const expireSeconds = normalizeTTL(ttl);
    return expireSeconds ? redis.set(key, value, "EX", expireSeconds) : redis.set(key, value);
};

export const update = async (key, value, ttl = null) => {
    return set(key, value, ttl); // Same as set
};

export const exists = async (key) => {
    if (!key) throw new Error("Redis EXISTS: key is required");
    return Boolean(await redis.exists(key));
};

export const del = async (key) => {
    if (!key) throw new Error("Redis DELETE: key is required");
    return redis.del(key);
};

export const delMany = async (keys = []) => {
    if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error("Redis DEL_MANY: keys array is required");
    }
    return redis.del(...keys);
};

// -------------------------
// Delete by pattern
// -------------------------
export const delByPattern = async (pattern) => {
    if (!pattern) throw new Error("Redis DEL_PATTERN: pattern is required");

    const keys = [];
    let cursor = "0";

    do {
        const [nextCursor, foundKeys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        keys.push(...foundKeys);
    } while (cursor !== "0");

    if (keys.length === 0) return 0;

    const BATCH_SIZE = 100;
    let deleted = 0;

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batch = keys.slice(i, i + BATCH_SIZE);
        deleted += await redis.del(...batch);
    }

    return deleted;
};



// export const set = async (key, value, type, expiration) => {
//     if (!key || value === undefined || value === null) {
//         throw new Error("Redis SET: key and value are required");
//     }
//     if (type && expiration) {
//         return redis.set(key, value, type, expiration);
//     }
//     return redis.set(key, value);
// };

// export const get = async (key) => {
//     if (!key) throw new Error("Redis GET: key is required");
//     return redis.get(key);
// };

// export const del = async (key) => {
//     if (!key) throw new Error("Redis DEL: key is required");
//     return redis.del(key);
// };

// export const exists = async (key) => {
//     if (!key) throw new Error("Redis EXISTS: key is required");
//     return redis.exists(key);
// };

// export const ttl = async (key) => {
//     if (!key) throw new Error("Redis TTL: key is required");
//     return redis.ttl(key);
// };

// export const setNX = async (key, value, ttl) => {
//     if (!key || value === undefined || value === null) {
//         throw new Error("Redis SETNX: key and value are required");
//     }
//     return redis.set(key, value, "EX", ttl, "NX");
// };

// export const scanKeys = async (pattern) => {
//     if (!pattern) throw new Error("Redis SCAN: pattern is required");

//     const keys = [];
//     let cursor = "0";

//     do {
//         const [nextCursor, foundKeys] = await redis.scan(
//             cursor,
//             "MATCH",
//             pattern,
//             "COUNT",
//             100
//         );
//         cursor = nextCursor;
//         keys.push(...foundKeys);
//     } while (cursor !== "0");

//     return { keys };
// };

// export const delByPattern = async (pattern) => {
//     if (!pattern) throw new Error("Redis DEL_PATTERN: pattern is required");

//     const { keys } = await scanKeys(pattern);

//     if (keys.length === 0) return 0;

//     const BATCH_SIZE = 100;
//     let deleted = 0;

//     for (let i = 0; i < keys.length; i += BATCH_SIZE) {
//         const batch = keys.slice(i, i + BATCH_SIZE);
//         const result = await redis.del(...batch);
//         deleted += result;
//     }

//     return deleted;
// };

// // SAFETY
// export const flushall = async () => {
//     if (process.env.NODE_ENV === "production") {
//         throw new Error("flushall is disabled in production");
//     }
//     return redis.flushall();
// };

export default redis;