import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { STORE_CACHE, STORE_MESSAGES } from "../../constants/user/store.js";
import {
    getCachedData,
    setCacheData,
    findVisibleStoreById,
    checkStoreOpenStatus,
    haversineDistance,
} from "../../helpers/user/storeHelper.js";
import asyncHandler from "../../utils/asyncHandler.js";
import logger from "../../utils/logger.js";

// ─── CHECK STORE AVAILABILITY ─────────────────────────────────────────────────
/**
 * GET /availability?storeId=<id>&lat=<lat>&lng=<lng>&radius=<km>
 *
 * BUG FIXED: was a plain function (storeId, userLat, userLng, radiusKm) —
 * Express would call it as (req, res, next), making storeId === req and
 * all coordinates undefined. Rewrote as a proper asyncHandler route handler.
 *
 * BUG FIXED: checkStoreOpenStatus and haversineDistance were called but never
 * imported — would throw ReferenceError at runtime.
 *
 * BUG FIXED: storeId was never read from anywhere (not in route params,
 * not in query validation). Added storeId to query reads + validation.
 *
 * BUG FIXED: findVisibleStoreById called with an array — select expects a
 * space-separated string.
 */
export const checkStoreAvailability = asyncHandler(async (req, res) => {
    // All validated and defaulted by Joi middleware
    const {
        storeId,
        lat: userLat,
        lng: userLng,
        radius: radiusKm,
    } = req.validated?.query ?? req.query;

    const cacheKey = STORE_CACHE.AVAILABILITY_KEY(storeId, userLat, userLng);
    const cached = await getCachedData(cacheKey);
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

    await setCacheData(cacheKey, responseData, STORE_CACHE.AVAILABILITY_TTL).catch((err) =>
        logger.warn("[checkStoreAvailability] Cache set failed:", err.message)
    );

    return sendResponse({
        res,
        message: STORE_MESSAGES.AVAILABILITY_FETCHED,
        data: responseData,
    });
});