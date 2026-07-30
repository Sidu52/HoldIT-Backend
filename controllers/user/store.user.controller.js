import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { STORE_MESSAGES } from "../../constants/user/store.js";
import { getCache, setCache } from "../../constants/redis/redisOperation.js";
import { StoreKeys, StoreTTL } from "../../constants/redis/store.keys.js";
import {
    findVisibleStoreById,
    checkStoreOpenStatus,
    haversineDistance,
} from "../../helpers/user/storeHelper.js";
import asyncHandler from "../../utils/asyncHandler.js";
import logger from "../../utils/logger.js";

export const checkStoreAvailability = asyncHandler(async (req, res) => {
    // All validated and defaulted by Joi middleware
    const {
        storeId,
        lat: userLat,
        lng: userLng,
        radius: radiusKm,
    } = req.validated?.query ?? req.query;

    const cacheKey = StoreKeys.availability(storeId, userLat, userLng);
    const cached = await getCache(cacheKey);
    if (cached) {
        return sendResponse({
            res,
            message: STORE_MESSAGES.AVAILABILITY_FETCHED,
            data: cached,
        });
    }

    // Space-separated string — correct API for select helpers
    const store = await findVisibleStoreById(
        storeId,
        "openTime closeTime location current_booking_count max_booking_capacity"
    );

    if (!store) {
        return sendError(res, STORE_MESSAGES.STORE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
    }

    // Open/closed check
    const isOpen = checkStoreOpenStatus(store.openTime, store.closeTime);
    if (!isOpen) {
        return sendResponse({
            res,
            message: STORE_MESSAGES.AVAILABILITY_FETCHED,
            data: { available: false, reason: "Store is currently closed" },
        });
    }

    // Distance check — only when the store has coordinates
    if (store.location?.coordinates?.length === 2) {
        const [storeLng, storeLat] = store.location.coordinates; // GeoJSON is [lng, lat]
        const distanceKm = haversineDistance(userLat, userLng, storeLat, storeLng);

        if (distanceKm > radiusKm) {
            return sendResponse({
                res,
                message: STORE_MESSAGES.AVAILABILITY_FETCHED,
                data: {
                    available: false,
                    reason: `Store is ${distanceKm.toFixed(1)} km away (limit: ${radiusKm} km)`,
                    distanceKm: parseFloat(distanceKm.toFixed(2)),
                },
            });
        }
    }

    // Capacity check
    const hasCapacity =
        store.current_booking_count < store.max_booking_capacity;

    const responseData = {
        available: isOpen && hasCapacity,
        storeId: store._id,
        ...(hasCapacity
            ? { slotsRemaining: store.max_booking_capacity - store.current_booking_count }
            : { reason: "Store is at full capacity" }),
    };

    await setCache(cacheKey, responseData, StoreTTL.AVAILABILITY).catch((err) =>
        logger.warn("[checkStoreAvailability] Cache set failed:", err.message)
    );

    return sendResponse({
        res,
        message: STORE_MESSAGES.AVAILABILITY_FETCHED,
        data: responseData,
    });
});