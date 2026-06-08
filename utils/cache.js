import { get, set, update, exists, del, delMany, delByPattern } from "../services/redisService.js";
import logger from "../utils/logger.js";

export const buildCacheKey = (prefix, params = {}) =>
    [prefix, ...Object.entries(params)
        .filter(([, v]) => v != null && v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
    ].join(":");

export const getCache = async (key) => {
    try {
        const data = await get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.error(`[getCache] "${key}":`, err);
        return null;
    }
};

export const setCache = async (key, value, ttl = 300) => {
    try {
        await set(key, JSON.stringify(value), ttl);
    } catch (err) {
        logger.error(`[setCache] "${key}":`, err);
    }
};

export const updateCache = async (key, value, ttl = 300) => {
    try {
        await update(key, JSON.stringify(value), ttl);
    } catch (err) {
        logger.error(`[updateCache] "${key}":`, err);
    }
};

export const deleteCache = async (key) => {
    try {
        await del(key);
    } catch (err) {
        logger.error(`[deleteCache] "${key}":`, err);
    }
};

export const deleteManyCache = async (keys = []) => {
    if (!keys.length) return;
    try {
        await delMany(keys);
    } catch (err) {
        logger.error(`[deleteManyCache]:`, err);
    }
};

export const deleteByPattern = async (pattern) => {
    try {
        await delByPattern(pattern);
    } catch (err) {
        logger.error(`[deleteByPattern] "${pattern}":`, err);
    }
};

export const isKeyExist = async (key) => {
    try {
        return await exists(key);
    } catch (err) {
        logger.error(`[isKeyExist] "${key}":`, err);
        return false;
    }
};

export const incrementCache = async (key, ttl = 60) => {
    try {
        const newValue = (Number(await getCache(key)) || 0) + 1;
        await setCache(key, newValue, ttl);
        return newValue;
    } catch (err) {
        logger.error(`[incrementCache] "${key}":`, err);
        return null;
    }
};

/**
 * Invalidate (delete) one or more cache keys by pattern.
 *
 * Supports two call signatures used across the codebase:
 *   invalidateCache("refresh:userId:*")          — raw pattern string
 *   invalidateCache("store_owner", userId)        — prefix + id  → "store_owner:userId*"
 */
export const invalidateCache = async (patternOrPrefix, id) => {
    const pattern = id !== undefined
        ? `${patternOrPrefix}:${id}*`
        : patternOrPrefix;
    try {
        await delByPattern(pattern);
    } catch (err) {
        logger.error(`[invalidateCache] "${pattern}":`, err);
    }
};

// ── Aliases for backward compatibility (previously lived in utils/cacheHelper.js) ──
export const getCachedData = getCache;
export const setCacheData  = setCache;