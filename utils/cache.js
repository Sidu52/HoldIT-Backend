import { get, set, update, exists, del, delMany, delByPattern } from "../services/redisService.js";
import logger from "./logger.js";

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

export const getCachedData = getCache;
export const setCacheData = setCache;
