import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import {
    DRIVER_RIDE_CACHE,
    DRIVER_RIDE_SELECT,
    DRIVER_RIDE_MESSAGES,
} from "../../constants/driver/driver.ride.js";
import {
    getCachedData,
    setCacheData,
    invalidateDriverRideCache,
    getAssignedRides,
    getDriverActiveRide,
    findDriverRide,
    getDriverRideHistory,
    processRideAccept,
    processRideReject,
    processStartPickup,
    processCompletePickup,
    buildPagination,
} from "../../helpers/driver/driverRideHelper.js";

import {getOfferStatus} from "../../helpers/user/driverAssignHelper.js";
import {invalidateBookingCache} from "../../helpers/user/bookingHelper.js";


// GET ASSIGNED RIDES to Driver
export const getAssignedRidesController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;

        const cacheKey = DRIVER_RIDE_CACHE.ASSIGNED_KEY(driverId);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: DRIVER_RIDE_MESSAGES.ASSIGNED_RIDES_FETCHED,
                data: cached,
            });
        }

        // Fetch from DB
        const rides = await getAssignedRides(driverId, DRIVER_RIDE_SELECT.LIST);

        const responseData = {
            rides,
            total: rides.length,
        };

        // Cache
        await setCacheData(cacheKey, responseData, DRIVER_RIDE_CACHE.ASSIGNED_TTL);

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.ASSIGNED_RIDES_FETCHED,
            data: responseData,
        });
    } catch (err) {
        console.error("Get Assigned Rides Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.FETCH_FAILED);
    }
};

//  GET ACTIVE RIDE
export const getActiveRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;

        // Cache check
        const cacheKey = DRIVER_RIDE_CACHE.ACTIVE_KEY(driverId);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: DRIVER_RIDE_MESSAGES.ACTIVE_RIDE_FETCHED,
                data: cached,
            });
        }

        // Fetch from DB
        const ride = await getDriverActiveRide(driverId, DRIVER_RIDE_SELECT.DETAIL);

        if (!ride) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.NO_ACTIVE_RIDE,
                STATUS_CODES.NOT_FOUND
            );
        }

        // Cache
        await setCacheData(cacheKey, ride, DRIVER_RIDE_CACHE.ACTIVE_TTL);

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.ACTIVE_RIDE_FETCHED,
            data: ride,
        });
    } catch (err) {
        console.error("Get Active Ride Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.FETCH_FAILED);
    }
};

// GET RIDE DETAILS
export const getRideDetailsController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        // ---- Cache check ----
        const cacheKey = DRIVER_RIDE_CACHE.RIDE_DETAIL_KEY(driverId, booking_id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: DRIVER_RIDE_MESSAGES.RIDE_DETAIL_FETCHED,
                data: cached,
            });
        }

        // ---- Fetch from DB ----
        const ride = await findDriverRide(
            booking_id,
            driverId,
            DRIVER_RIDE_SELECT.DETAIL
        );

        if (!ride) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        // ---- Cache ----
        await setCacheData(cacheKey, ride, DRIVER_RIDE_CACHE.DETAIL_TTL);

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.RIDE_DETAIL_FETCHED,
            data: ride,
        });
    } catch (err) {
        console.error("Get Ride Details Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.DETAIL_FAILED);
    }
};

// GET RIDE HISTORY
export const getRideHistoryController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const {
            page = 1,
            limit = 10,
            sort_order = "desc",
        } = req.validated?.query || req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        // Cache check
        const cacheKey = DRIVER_RIDE_CACHE.HISTORY_KEY(driverId, pageNum, limitNum);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: DRIVER_RIDE_MESSAGES.HISTORY_FETCHED,
                data: cached,
            });
        }

        // Fetch from DB
        const { rides, total } = await getDriverRideHistory(
            driverId,
            skip,
            limitNum,
            sortDir
        );

        const responseData = {
            rides,
            pagination: buildPagination(pageNum, limitNum, total),
        };

        // Cache
        await setCacheData(cacheKey, responseData, DRIVER_RIDE_CACHE.HISTORY_TTL);

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.HISTORY_FETCHED,
            data: responseData,
        });
    } catch (err) {
        console.error("Get Ride History Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.HISTORY_FAILED);
    }
};

// ACCEPT RIDE
export const acceptRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        // Verify offer exists and belongs to this driver
        const { exists, offer } = await getOfferStatus(booking_id);

        if (!exists) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.OFFER_EXPIRED,
                STATUS_CODES.NOT_FOUND
            );
        }

        if (offer.driverId !== driverId) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.OFFER_NOT_YOURS,
                STATUS_CODES.FORBIDDEN
            );
        }

        if (offer.status === "accepted") {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.ALREADY_ACCEPTED,
                STATUS_CODES.CONFLICT
            );
        }

        // Atomically accept
        const { success, booking } = await processRideAccept(booking_id, driverId);

        if (!success) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.RIDE_NOT_AVAILABLE,
                STATUS_CODES.CONFLICT
            );
        }

        // Invalidate caches
        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        // TODO: Send push notification to user
        // "Your driver is on the way!"

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.RIDE_ACCEPTED,
            data: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: booking.status,
                pickupLocation: booking.pickupLocation,
                luggage: booking.luggage,
                scheduledAt: booking.pickup?.scheduledAt,
            },
        });
    } catch (err) {
        console.error("Accept Ride Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.ACCEPT_FAILED);
    }
};

// REJECT RIDE
export const rejectRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        // Verify offer
        const { exists, offer } = await getOfferStatus(booking_id);

        if (!exists || offer.driverId !== driverId) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        // Process rejection
        await processRideReject(booking_id, driverId);

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.RIDE_REJECTED,
        });
    } catch (err) {
        console.error("Reject Ride Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.REJECT_FAILED);
    }
};

// START PICKUP
export const startPickupController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        // ---- Update booking ----
        const booking = await processStartPickup(booking_id, driverId);

        if (!booking) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        // ---- Invalidate caches ----
        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        // TODO: Notify user "Driver is heading to your location"

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.PICKUP_STARTED,
            data: {
                bookingId: booking._id,
                status: booking.status,
                pickupLocation: booking.pickupLocation,
            },
        });
    } catch (err) {
        console.error("Start Pickup Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.START_PICKUP_FAILED);
    }
};

// COMPLETE PICKUP
export const completePickupController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        // ---- Update booking ----
        const booking = await processCompletePickup(booking_id, driverId);

        if (!booking) {
            return sendError(
                res,
                DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        // ---- Invalidate caches ----
        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        // TODO: Notify user "Luggage collected, heading to store"

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.PICKUP_COMPLETED,
            data: {
                bookingId: booking._id,
                status: booking.status,
            },
        });
    } catch (err) {
        console.error("Complete Pickup Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.COMPLETE_PICKUP_FAILED);
    }
};
