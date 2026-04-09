import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import {
    STORE_CACHE,
    STORE_SELECT,
    STORE_MESSAGES,
} from "../../constants/user/store.js";
import {
    getCachedData,
    setCacheData,
    buildSearchFilter,
    buildNearbyPipeline,
    enrichNearbyStores,
    calculateAvailability,
    findVisibleStoreById,
    findStoreById,
    buildPagination,
} from "../../helpers/user/storeHelper.js";
import logger from "../../utils/logger.js";

// Store Availability
export const checkStoreAvailability = async (
    storeId,
    userLat,
    userLng,
    radiusKm = 5
) => {
    const store = await findVisibleStoreById(storeId, [
        "openTime",
        "closeTime",
        "location",
        "isActive",
    ]);

    if (!store) {
        return { available: false, reason: "Store not found" };
    }

    const isOpen = checkStoreOpenStatus(store.openTime, store.closeTime);
    if (!isOpen) {
        return { available: false, reason: "Store is currently closed" };
    }

    if (userLat != null && userLng != null && store.location?.coordinates) {
        const [storeLng, storeLat] = store.location.coordinates;
        const distanceKm = haversineDistance(userLat, userLng, storeLat, storeLng);

        if (distanceKm > radiusKm) {
            return {
                available: false,
                reason: `Store is ${distanceKm.toFixed(1)} km away (limit: ${radiusKm} km)`,
            };
        }
    }

    return { available: true, store };
};

const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};


// Search Stores
export const searchStores = async (req, res) => {
    try {
        const {
            q = "",
            page = 1,
            limit = 10,
            sort_by = "rating",
        } = req.validated.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const cacheKey = STORE_CACHE.SEARCH_KEY(q, pageNum, limitNum, sort_by);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: STORE_MESSAGES.SEARCH_SUCCESS,
                data: cached,
            });
        }

        const filter = buildSearchFilter(q);
        const sortOptions = {
            rating: { rating: -1, rating_count: -1 },
            name: { store_name: 1 },
            newest: { createdAt: -1 },
        };
        const sort = sortOptions[sort_by] || sortOptions.rating;
        const [stores, total] = await Promise.all([
            Store.find(filter)
                .select(STORE_SELECT.LIST)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Store.countDocuments(filter),
        ]);

        const responseData = {
            stores,
            pagination: buildPagination(pageNum, limitNum, total),
        };
        await setCacheData(cacheKey, responseData, STORE_CACHE.SEARCH_TTL);

        return sendResponse({
            res,
            message: STORE_MESSAGES.SEARCH_SUCCESS,
            data: responseData,
        });
    } catch (err) {
        logger.error("Search Stores Error:", err);
        return sendError(res, STORE_MESSAGES.SEARCH_FAILED);
    }
};

// Get Nearby Stores
export const getNearbyStores = async (req, res) => {
    try {
        const {
            lat,
            lng,
            radius = 10,
            page = 1,
            limit = 10,
        } = req.validated.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const radiusKm = Number(radius);
        const skip = (pageNum - 1) * limitNum;
        const cacheKey = STORE_CACHE.NEARBY_KEY(lat, lng, radiusKm, pageNum, limitNum);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: STORE_MESSAGES.NEARBY_SUCCESS,
                data: cached,
            });
        }
        const pipeline = buildNearbyPipeline(
            Number(lat),
            Number(lng),
            radiusKm,
            skip,
            limitNum,
            STORE_SELECT.LIST
        );
        const [result] = await Store.aggregate(pipeline);

        const total = result.metadata[0]?.total || 0;
        const stores = enrichNearbyStores(result.stores);

        const responseData = {
            stores,
            searchCenter: { lat: Number(lat), lng: Number(lng) },
            radiusKm,
            pagination: buildPagination(pageNum, limitNum, total),
        };
        await setCacheData(cacheKey, responseData, STORE_CACHE.NEARBY_TTL);

        return sendResponse({
            res,
            message: STORE_MESSAGES.NEARBY_SUCCESS,
            data: responseData,
        });
    } catch (err) {
        logger.error("Get Nearby Stores Error:", err);
        return sendError(res, STORE_MESSAGES.NEARBY_FAILED);
    }
};

// Get Store By ID
export const getStoreById = async (req, res) => {
    try {
        const { id } = req.params;

        const cacheKey = STORE_CACHE.DETAIL_KEY(id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: STORE_MESSAGES.DETAIL_SUCCESS,
                data: cached,
            });
        }

        const store = await findVisibleStoreById(id, STORE_SELECT.DETAIL);

        if (!store) {
            return sendError(
                res,
                STORE_MESSAGES.STORE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }
        await setCacheData(cacheKey, store, STORE_CACHE.DETAIL_TTL);

        return sendResponse({
            res,
            message: STORE_MESSAGES.DETAIL_SUCCESS,
            data: store,
        });
    } catch (err) {
        logger.error("Get Store By ID Error:", err);
        return sendError(res, STORE_MESSAGES.DETAIL_FAILED);
    }
};

// Get Store Availability
export const getStoreAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = STORE_CACHE.AVAILABILITY_KEY(id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: STORE_MESSAGES.AVAILABILITY_SUCCESS,
                data: cached,
            });
        }
        const store = await findStoreById(id, STORE_SELECT.AVAILABILITY);

        if (!store) {
            return sendError(
                res,
                STORE_MESSAGES.STORE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const availability = calculateAvailability(store);

        await setCacheData(cacheKey, availability, STORE_CACHE.AVAILABILITY_TTL);

        return sendResponse({
            res,
            message: STORE_MESSAGES.AVAILABILITY_SUCCESS,
            data: availability,
        });
    } catch (err) {
        logger.error("Get Store Availability Error:", err);
        return sendError(res, STORE_MESSAGES.AVAILABILITY_FAILED);
    }
};