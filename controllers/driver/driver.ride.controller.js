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
    processArriveAtPickup,
    processCompletePickup,
    processArriveAtStore,
    buildPagination,
    processDriverCancelRide,
} from "../../helpers/driver/driverRideHelper.js";

import { getOfferStatus } from "../../helpers/user/driverAssignHelper.js";
import { invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import { REDIS_KEYS } from "../../constants/user/booking.js";
import redis from "../../services/redisService.js";
import Booking from "../../models/Booking.js";

// GET PENDING OFFER
export const getPendingOfferController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;

        const offerKey = REDIS_KEYS.DRIVER_OFFERED(driverId);
        const bookingId = await redis.get(offerKey);

        if (!bookingId) {
            return sendError(res, "No pending offer found.", STATUS_CODES.NOT_FOUND);
        }

        const { exists, offer } = await getOfferStatus(bookingId);

        if (!exists || offer.status !== "pending") {
            await redis.del(offerKey);
            return sendError(res, "Offer has expired.", STATUS_CODES.NOT_FOUND);
        }

        if (offer.driverId !== driverId) {
            return sendError(res, "This offer is not for you.", STATUS_CODES.FORBIDDEN);
        }

        const booking = await Booking.findById(bookingId)
            .select("bookingCode status pickupLocation deliveryLocation luggage pickup pricing userId storeId")
            .populate("userId", "first_name last_name phone")
            .populate("storeId", "store_name store_contact_number location")
            .lean();

        if (!booking) {
            await redis.del(offerKey);
            return sendError(res, "Booking not found.", STATUS_CODES.NOT_FOUND);
        }

        const offerTTL = await redis.ttl(REDIS_KEYS.BOOKING_OFFER(bookingId));

        return sendResponse({
            res,
            message: "Pending offer fetched successfully.",
            data: {
                offer: {
                    bookingId,
                    attemptNumber: offer.attemptNumber,
                    expiresInSeconds: offerTTL > 0 ? offerTTL : 0,
                },
                booking,
            },
        });
    } catch (err) {
        console.error("Get Pending Offer Error:", err);
        return sendError(res, "Failed to fetch pending offer.");
    }
};

// GET ASSIGNED RIDES
export const getAssignedRidesController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const cacheKey = DRIVER_RIDE_CACHE.ASSIGNED_KEY(driverId);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ASSIGNED_RIDES_FETCHED, data: cached });
        }

        const rides = await getAssignedRides(driverId, DRIVER_RIDE_SELECT.LIST);
        const responseData = { rides, total: rides.length };

        await setCacheData(cacheKey, responseData, DRIVER_RIDE_CACHE.ASSIGNED_TTL);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ASSIGNED_RIDES_FETCHED, data: responseData });
    } catch (err) {
        console.error("Get Assigned Rides Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.FETCH_FAILED);
    }
};

// GET ACTIVE RIDE
export const getActiveRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const cacheKey = DRIVER_RIDE_CACHE.ACTIVE_KEY(driverId);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ACTIVE_RIDE_FETCHED, data: cached });
        }

        const ride = await getDriverActiveRide(driverId, DRIVER_RIDE_SELECT.DETAIL);

        if (!ride) {
            return sendError(res, DRIVER_RIDE_MESSAGES.NO_ACTIVE_RIDE, STATUS_CODES.NOT_FOUND);
        }

        await setCacheData(cacheKey, ride, DRIVER_RIDE_CACHE.ACTIVE_TTL);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ACTIVE_RIDE_FETCHED, data: ride });
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

        const cacheKey = DRIVER_RIDE_CACHE.RIDE_DETAIL_KEY(driverId, booking_id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.RIDE_DETAIL_FETCHED, data: cached });
        }

        const ride = await findDriverRide(booking_id, driverId, DRIVER_RIDE_SELECT.DETAIL);

        if (!ride) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await setCacheData(cacheKey, ride, DRIVER_RIDE_CACHE.DETAIL_TTL);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.RIDE_DETAIL_FETCHED, data: ride });
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

        const cacheKey = DRIVER_RIDE_CACHE.HISTORY_KEY(driverId, pageNum, limitNum);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.HISTORY_FETCHED, data: cached });
        }

        const { rides, total } = await getDriverRideHistory(driverId, skip, limitNum, sortDir);
        const responseData = { rides, pagination: buildPagination(pageNum, limitNum, total) };

        await setCacheData(cacheKey, responseData, DRIVER_RIDE_CACHE.HISTORY_TTL);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.HISTORY_FETCHED, data: responseData });
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

        const { exists, offer } = await getOfferStatus(booking_id);

        if (!exists) {
            return sendError(res, DRIVER_RIDE_MESSAGES.OFFER_EXPIRED, STATUS_CODES.NOT_FOUND);
        }

        if (offer.driverId !== driverId) {
            return sendError(res, DRIVER_RIDE_MESSAGES.OFFER_NOT_YOURS, STATUS_CODES.FORBIDDEN);
        }

        if (offer.status === "accepted") {
            return sendError(res, DRIVER_RIDE_MESSAGES.ALREADY_ACCEPTED, STATUS_CODES.CONFLICT);
        }

        const { success, booking } = await processRideAccept(booking_id, driverId);

        if (!success) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_AVAILABLE, STATUS_CODES.CONFLICT);
        }

        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

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

        const { exists, offer } = await getOfferStatus(booking_id);

        if (!exists || offer.driverId !== driverId) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await processRideReject(booking_id, driverId);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.RIDE_REJECTED });
    } catch (err) {
        console.error("Reject Ride Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.REJECT_FAILED);
    }
};

// ARRIVE AT PICKUP — FIX #9: driver signals they've reached the customer
export const arriveAtPickupController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processArriveAtPickup(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        return sendResponse({
            res,
            message: "Arrived at pickup location.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        console.error("Arrive At Pickup Error:", err);
        return sendError(res, "Failed to update arrival status.");
    }
};

// COMPLETE PICKUP — luggage collected, heading to store
export const completePickupController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processCompletePickup(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.PICKUP_COMPLETED,
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        console.error("Complete Pickup Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.COMPLETE_PICKUP_FAILED);
    }
};

// ARRIVE AT STORE — FIX #8: driver reached the store with luggage
export const arriveAtStoreController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processArriveAtStore(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverRideCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        return sendResponse({
            res,
            message: "Arrived at store with luggage.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        console.error("Arrive At Store Error:", err);
        return sendError(res, "Failed to update store arrival.");
    }
};

// CANCEL RIDE
export const cancelRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;
        const { reason = "" } = req.body;

        const result = await processDriverCancelRide(booking_id, driverId, reason);

        if (!result.success) {
            const statusMap = {
                RIDE_NOT_FOUND: STATUS_CODES.NOT_FOUND,
                CANNOT_CANCEL_IN_STATUS: STATUS_CODES.CONFLICT,
                UPDATE_FAILED: STATUS_CODES.CONFLICT,
            };
            return sendError(
                res,
                result.reason,
                statusMap[result.reason] ?? STATUS_CODES.BAD_REQUEST
            );
        }

        return sendResponse({
            res,
            message: result.action === "CRITICAL_FLAGGED"
                ? "Cancellation recorded. Ops team has been alerted."
                : "Ride cancelled. A new driver is being assigned.",
            data: { bookingId: result.bookingId, action: result.action },
        });
    } catch (err) {
        console.error("Cancel Ride Error:", err);
        return sendError(res, "Failed to cancel ride.");
    }
};