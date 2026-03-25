import { get, set } from "../services/redisService.js";
import logger from "./logger.js";


export const getCachedData = async (cacheKey) => {
    try {
        const cached = await get(cacheKey);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        logger.error("Cache read error:", err);
        return null;
    }
};

export const setCacheData = async (cacheKey, data, ttl) => {
    try {
        await set(cacheKey, JSON.stringify(data), "EX", ttl);
    } catch (err) {
        logger.error("Cache write error:", err);
    }
};
