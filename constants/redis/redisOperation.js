import { redisClient } from "../../services/redisService.js";
import logger from "../../utils/logger.js";

/**
 * Get a value from cache. Returns parsed JSON or null.
 */
export const getCache = async (key) => {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.error(`[getCache] "${key}":`, err.message);
        return null;
    }
};

/**
 * Calculate jittered TTL (seconds) to prevent cache stampedes / thundering herd problem.
 * Adds a random variation (default ±10%) for any TTL > 5 seconds.
 * Short lock/state TTLs (<= 5s) skip jitter to preserve exact timing semantics.
 *
 * @param {number} ttl - Base TTL in seconds
 * @param {number} jitterRatio - Jitter factor (default 0.10 for ±10%)
 * @returns {number} Jittered TTL in seconds
 */
export const getJitteredTTL = (ttl, jitterRatio = 0.10) => {
    if (!ttl || typeof ttl !== "number" || ttl <= 5) return ttl;
    const min = Math.floor(ttl * (1 - jitterRatio));
    const max = Math.ceil(ttl * (1 + jitterRatio));
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Set a value in cache with TTL (seconds). Overwrites if exists.
 * Applies TTL jitter by default to prevent simultaneous cache expirations.
 */
export const setCache = async (key, value, ttl = 300, enableJitter = true) => {
    try {
        const payload = JSON.stringify(value);
        if (ttl) {
            const finalTtl = enableJitter ? getJitteredTTL(ttl) : ttl;
            await redisClient.set(key, payload, "EX", finalTtl);
        } else {
            await redisClient.set(key, payload);
        }
        return true;
    } catch (err) {
        logger.error(`[setCache] "${key}":`, err.message);
        return false;
    }
};

/**
 * Partial update — merges into existing cached object.
 * Preserves remaining TTL unless a new one is explicitly passed.
 * Falls back to a plain set if key doesn't exist yet.
 */
export const updateCache = async (key, partialValue, ttl) => {
    try {
        const existing = await getCache(key);
        const merged = existing && typeof existing === "object"
            ? { ...existing, ...partialValue }
            : partialValue;

        let finalTtl = ttl;
        if (finalTtl === undefined) {
            const remaining = await redisClient.ttl(key); // -1 = no expiry, -2 = missing
            finalTtl = remaining > 0 ? remaining : 300;
        }

        return await setCache(key, merged, finalTtl);
    } catch (err) {
        logger.error(`[updateCache] "${key}":`, err.message);
        return false;
    }
};

/* DELETE                                                                      */
export const deleteCache = async (key) => {
    try {
        await redisClient.del(key);
        return true;
    } catch (err) {
        logger.error(`[deleteCache] "${key}":`, err.message);
        return false;
    }
};

export const deleteManyCache = async (keys = []) => {
    if (!keys.length) return true;
    try {
        await redisClient.del(...keys);
        return true;
    } catch (err) {
        logger.error(`[deleteManyCache]:`, err.message);
        return false;
    }
};

/**
 * Delete all keys matching a pattern (e.g. "user_bookings:123:*").
 * Uses SCAN instead of KEYS — non-blocking, safe for production.
 */
export const deleteByPattern = async (pattern) => {
    try {
        let cursor = "0";
        let deletedCount = 0;
        do {
            const [nextCursor, keys] = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = nextCursor;
            if (keys.length) {
                await redisClient.del(...keys);
                deletedCount += keys.length;
            }
        } while (cursor !== "0");
        return deletedCount;
    } catch (err) {
        logger.error(`[deleteByPattern] "${pattern}":`, err); // full error object/stack, not just err.message
        return 0;
    }
};

/* EXISTS / TTL                                                                */
export const isKeyExist = async (key) => {
    try {
        const result = await redisClient.exists(key);
        return result === 1;
    } catch (err) {
        logger.error(`[isKeyExist] "${key}":`, err.message);
        return false;
    }
};

export const getTTL = async (key) => {
    try {
        return await redisClient.ttl(key); // -1 no expiry, -2 missing
    } catch (err) {
        logger.error(`[getTTL] "${key}":`, err.message);
        return -2;
    }
};

export const setExpiry = async (key, ttl) => {
    try {
        await redisClient.expire(key, ttl);
        return true;
    } catch (err) {
        logger.error(`[setExpiry] "${key}":`, err.message);
        return false;
    }
};

/* ATOMIC COUNTERS                                                             */
/**
 * Atomic increment — safe under concurrency (unlike get+set).
 * TTL only applied on first creation of the key.
 */
export const incrementCache = async (key, ttl = 60, by = 1) => {
    try {
        const value = await redisClient.incrby(key, by);
        if (value === by) {
            // key was just created this call — attach TTL (with jitter)
            const finalTtl = getJitteredTTL(ttl);
            await redisClient.expire(key, finalTtl);
        }
        return value;
    } catch (err) {
        logger.error(`[incrementCache] "${key}":`, err.message);
        return null;
    }
};

export const decrementCache = async (key, by = 1) => {
    try {
        return await redisClient.decrby(key, by);
    } catch (err) {
        logger.error(`[decrementCache] "${key}":`, err.message);
        return null;
    }
};

/* READ-THROUGH HELPER                                                         */
/**
 * Cache-aside pattern: return cached value if present,
 * otherwise run fetcher(), cache the result, and return it.
 * Cache write is fire-and-forget so it never blocks the response.
 */
export const cacheAside = async (key, ttl, fetcher) => {
    const cached = await getCache(key);
    if (cached !== null) return cached;

    const fresh = await fetcher();

    if (fresh !== null && fresh !== undefined) {
        setCache(key, fresh, ttl).catch((err) =>
            logger.warn(`[cacheAside] set failed "${key}":`, err.message)
        );
    }

    return fresh;
};

/* GENERIC INVALIDATION HELPERS                                                */
/**
 * Delete a fixed list of exact keys + a list of patterns in one call.
 * Domain-specific invalidate functions (invalidateBookingCache, etc.)
 * should be built on top of this using their own key files.
 */
export const invalidate = async ({ keys = [], patterns = [] } = {}) => {
    const jobs = [
        ...keys.filter(Boolean).map((k) => deleteCache(k)),
        ...patterns.filter(Boolean).map((p) => deleteByPattern(p)),
    ];

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => {
        if (r.status === "rejected") {
            logger.warn(`[invalidate]:`, r.reason?.message);
        }
    });

    return results;
};

/* BATCH GET (pipeline)                                                        */
/**
 * Fetch multiple keys in one round trip. Returns array aligned with input keys,
 * with null for misses.
 */
export const getManyCache = async (keys = []) => {
    if (!keys.length) return [];
    try {
        const pipeline = redisClient.pipeline();
        keys.forEach((k) => pipeline.get(k));
        const results = await pipeline.exec();
        return results.map(([err, val]) => {
            if (err || !val) return null;
            try {
                return JSON.parse(val);
            } catch {
                return null;
            }
        });
    } catch (err) {
        logger.error(`[getManyCache]:`, err.message);
        return keys.map(() => null);
    }
};

/* DISTRIBUTED LOCK (SET EX NX)                                                */
/**
 * Atomic lock acquisition. Returns true if acquired, false otherwise.
 */
export const acquireLock = async (key, ttlSeconds = 55, value = "1") => {
    try {
        const result = await redisClient.set(key, value, "EX", ttlSeconds, "NX");
        return result === "OK";
    } catch (err) {
        logger.error(`[acquireLock] "${key}":`, err.message);
        return false;
    }
};