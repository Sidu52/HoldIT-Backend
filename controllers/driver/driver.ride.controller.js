import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import {
    DRIVER_RIDE_SELECT,
    DRIVER_RIDE_MESSAGES,
} from "../../constants/driver/driver.ride.js";
import {
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
    processArriveAtStoreForReturn,
    processArriveAtUserReturn,
    processCompleteDelivery,
    processCompletePickupAtStore,
} from "../../helpers/driver/driverRideHelper.js";
import { invalidateDriverCache } from "../../constants/redis/invalidate/driver.invalidate.js" 
import { getCache, setCache, deleteCache } from "../../constants/redis/redisOperation.js";
import { DriverKeys, DriverTTL } from "../../constants/redis/driver.keys.js";
import { BookingKeys } from "../../constants/redis/booking.keys.js";
import { getOfferStatus } from "../../helpers/user/driverAssignHelper.js";
import { invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import redis from "../../services/redisService.js";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import logger from "../../utils/logger.js";
import { uploadMultipleBuffers } from "../../services/cloudinaryService.js";
import { CLOUDINARY_FOLDERS } from "../../constants/cloudinary.folders.js";

// Socket helpers
import { getIO } from "../../src/socket/index.js";
import {
    emitBookingDriverAssigned,
    emitBookingDriverArrived,
    emitBookingPickedUp,
    emitBookingArrivedAtStore,
    emitBookingDelivered,
    emitBookingReturnDriverAssigned,
    emitBookingArrivedForDelivery,
    emitBookingOutForReturn,
} from "../../src/socket/emitters/booking.emitter.js";
import { emitDriverOfferRemoved } from "../../src/socket/emitters/driver.emitter.js";
import mongoose from "mongoose";


/** Safely get Socket.IO instance; returns null if not initialized */
const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};


// GET PENDING OFFER
export const getPendingOfferController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;

        const offerKey = DriverKeys.offered(driverId);
        const bookingId = await redis.get(offerKey);

        if (!bookingId) {
            return sendResponse({ res, message: "No pending offer.", data: null });
        }

        const { exists, offer } = await getOfferStatus(bookingId);

        if (!exists || offer.status !== "pending") {
            await redis.del(offerKey);
            return sendResponse({ res, message: "No pending offer.", data: null });
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
            return sendResponse({ res, message: "No pending offer.", data: null });
        }

        const offerTTL = await redis.ttl(BookingKeys.offer(bookingId));
        const remainingSeconds = offerTTL > 0 ? offerTTL : 0;
        const now = Date.now();
        const expiresAt = now + remainingSeconds * 1000;

        const isReturn = offer.type === "RETURN" || booking.status === BOOKING_STATUS.RETURN_DRIVER_ASSIGNED;
        const fee = isReturn
            ? (booking.pricing?.distanceCharge || 0)
            : (booking.pricing?.advanceBreakdown?.deliveryFee || 0);
        const fare = fee + (booking.tipAmount || 0);

        return sendResponse({
            res,
            message: "Pending offer fetched successfully.",
            data: {
                offer: {
                    bookingId,
                    attemptNumber: offer.attemptNumber,
                    expiresInSeconds: remainingSeconds,
                    offeredAt: offer.offeredAt ? Number(offer.offeredAt) : now,
                    expiresAt,
                    fare,
                    driverEarnings: fare,
                },
                booking: {
                    ...booking,
                    fare,
                    driverEarnings: fare,
                },
            },
        });
    } catch (err) {
        logger.error("Get Pending Offer Error:", err);
        return sendError(res, "Failed to fetch pending offer.");
    }
};

// GET ASSIGNED RIDES
export const getAssignedRidesController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const cacheKey = DriverKeys.assigned(driverId);
        const cached = await getCache(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ASSIGNED_RIDES_FETCHED, data: cached });
        }

        const rides = await getAssignedRides(driverId, DRIVER_RIDE_SELECT.LIST);
        const responseData = { rides, total: rides.length };

        await setCache(cacheKey, responseData, DriverTTL.ASSIGNED);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ASSIGNED_RIDES_FETCHED, data: responseData });
    } catch (err) {
        logger.error("Get Assigned Rides Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.FETCH_FAILED);
    }
};

// GET ACTIVE RIDE
export const getActiveRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const cacheKey = DriverKeys.activeRide(driverId);
        const cached = await getCache(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ACTIVE_RIDE_FETCHED, data: cached });
        }

        const ride = await getDriverActiveRide(driverId, DRIVER_RIDE_SELECT.DETAIL);

        if (!ride) {
            return sendResponse({ res, message: "No active ride.", data: null });
        }

        await setCache(cacheKey, ride, DriverTTL.ACTIVE);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.ACTIVE_RIDE_FETCHED, data: ride });
    } catch (err) {
        logger.error("Get Active Ride Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.FETCH_FAILED);
    }
};

// GET RIDE DETAILS
export const getRideDetailsController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const cacheKey = DriverKeys.rideDetail(driverId, booking_id);
        const cached = await getCache(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.RIDE_DETAIL_FETCHED, data: cached });
        }

        const ride = await findDriverRide(booking_id, driverId, DRIVER_RIDE_SELECT.DETAIL);

        if (!ride) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await setCache(cacheKey, ride, DriverTTL.DETAIL);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.RIDE_DETAIL_FETCHED, data: ride });
    } catch (err) {
        logger.error("Get Ride Details Error:", err);
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

        const cacheKey = DriverKeys.history(driverId, pageNum, limitNum);
        const cached = await getCache(cacheKey);

        if (cached) {
            return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.HISTORY_FETCHED, data: cached });
        }

        const { rides, total } = await getDriverRideHistory(driverId, skip, limitNum, sortDir);
        const responseData = { rides, pagination: buildPagination(pageNum, limitNum, total) };

        await setCache(cacheKey, responseData, DriverTTL.HISTORY);

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.HISTORY_FETCHED, data: responseData });
    } catch (err) {
        logger.error("Get Ride History Error:", err);
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
            await clearOffer(booking_id, driverId).catch((err) =>
                logger.error(`[acceptRideController] Failed to clear offer key on ride accept failure:`, err.message)
            );
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_AVAILABLE, STATUS_CODES.CONFLICT);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);
        emitDriverOfferRemoved(safeGetIO(), driverId, {
            bookingId: booking_id,
            reason: "accepted",
        });


        // Emit socket event: driver assigned
        try {
            const io = safeGetIO();
            if (io) {
                const driverData = await Driver.findById(driverId)
                    .select("first_name last_name phone vehicle_details live_location")
                    .lean();

                if (booking.status === BOOKING_STATUS.DRIVER_ASSIGNED) {
                    emitBookingDriverAssigned(io, booking_id, booking.userId.toString(), driverData);
                } else if (booking.status === BOOKING_STATUS.RETURN_DRIVER_ASSIGNED) {
                    emitBookingReturnDriverAssigned(io, booking_id, booking.userId.toString(), driverData);
                }
            }
        } catch (socketErr) {
            logger.debug(`[AcceptRide:Socket] Emission skipped: ${socketErr.message}`);
        }

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
        logger.error("Accept Ride Error:", err);
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
        emitDriverOfferRemoved(safeGetIO(), driverId, {
            bookingId: booking_id,
            reason: "rejected",
        });

        return sendResponse({ res, message: DRIVER_RIDE_MESSAGES.RIDE_REJECTED });
    } catch (err) {
        logger.error("Reject Ride Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.REJECT_FAILED);
    }
};

// ARRIVE AT PICKUP — driver signals they've reached the customer
export const arriveAtPickupController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processArriveAtPickup(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);


        // Emit socket event: driver arrived at pickup
        try {
            const io = safeGetIO();
            if (io) {
                emitBookingDriverArrived(io, booking_id, booking.userId.toString(), driverId, new Date());
            }
        } catch (socketErr) {
            logger.debug(`[ArrivePickup:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: "Arrived at pickup location.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        logger.error("Arrive At Pickup Error:", err);
        return sendError(res, "Failed to update arrival status.");
    }
};

// COMPLETE PICKUP — luggage collected, heading to store
export const completePickupController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;
        const { otp } = req.body || {};
        let photos = [];
        if (req.files && req.files.length > 0) {
            const uploadResults = await uploadMultipleBuffers(req.files, {
                folder: CLOUDINARY_FOLDERS.BOOKINGS.PICKUP,
            });
            photos = uploadResults.map(r => r.secure_url);
        }

        if (!otp) {
            return sendError(res, "Pickup OTP is required.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await processCompletePickup(booking_id, driverId, otp, photos);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);


        // Emit socket event: luggage picked up
        try {
            const io = safeGetIO();
            if (io) {
                const driver = await Driver.findById(driverId).select("first_name last_name").lean();
                const driverName = driver ? `${driver.first_name} ${driver.last_name}`.trim() : "Driver";
                emitBookingPickedUp(io, booking_id, booking.userId.toString(), booking.storeId?.toString(), new Date(), driverName);
            }
        } catch (socketErr) {
            logger.debug(`[CompletePickup:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.PICKUP_COMPLETED,
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        if (err.message === "Invalid pickup OTP") {
            return sendError(res, err.message, STATUS_CODES.BAD_REQUEST);
        }
        logger.error("Complete Pickup Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.COMPLETE_PICKUP_FAILED);
    }
};

// ARRIVE AT STORE — driver reached the store with luggage
export const arriveAtStoreController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processArriveAtStore(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);


        // Emit socket event: arrived at store
        try {
            const io = safeGetIO();
            if (io) {
                emitBookingArrivedAtStore(io, booking_id, booking.storeId?.toString(), driverId, new Date());
            }
        } catch (socketErr) {
            logger.debug(`[ArriveStore:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: "Arrived at store with luggage.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        logger.error("Arrive At Store Error:", err);
        return sendError(res, "Failed to update store arrival.");
    }
};

// ARRIVE AT STORE FOR RETURN — driver reached the store to collect return luggage
export const arriveAtStoreForReturnController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processArriveAtStoreForReturn(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);

        // Emit socket event if needed or store status update
        try {
            const io = safeGetIO();
            if (io) {
                // Inform store that return driver has arrived
                io.to(`store:${booking.storeId}`).emit("store:driver_arrived_for_return", {
                    bookingId: booking._id,
                    driverId,
                    arrivedAt: new Date(),
                });
            }
        } catch (socketErr) {
            logger.debug(`[ArriveStoreForReturn:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: "Arrived at store for return luggage pickup.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        logger.error("Arrive At Store For Return Error:", err);
        return sendError(res, "Failed to update store arrival for return.");
    }
};

// COMPLETE PICKUP luggage collected, heading to store
export const completePickupAtStoreController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;
        const { otp } = req.body || {};
        let photos = [];
        if (req.files && req.files.length > 0) {
            const uploadResults = await uploadMultipleBuffers(req.files, {
                folder: CLOUDINARY_FOLDERS.BOOKINGS.STORAGE,
            });
            photos = uploadResults.map(r => r.secure_url);
        }

        if (!otp) {
            return sendError(res, "Pickup OTP is required.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await processCompletePickupAtStore(booking_id, driverId, otp, photos);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);


        // Emit socket event: out for return delivery
        try {
            const io = safeGetIO();
            if (io) {
                emitBookingOutForReturn(io, booking_id, booking.userId.toString(), driverId, new Date());
            }
        } catch (socketErr) {
            logger.debug(`[CompletePickupAtStore:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: DRIVER_RIDE_MESSAGES.PICKUP_COMPLETED,
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        if (err.message === "Invalid pickup OTP") {
            return sendError(res, err.message, STATUS_CODES.BAD_REQUEST);
        }
        logger.error("Complete Pickup Error:", err);
        return sendError(res, DRIVER_RIDE_MESSAGES.COMPLETE_PICKUP_FAILED);
    }
};

// ARRIVE AT USER FOR RETURN Delivery — driver signals they've reached the user for return
export const arriveAtUserReturnController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await processArriveAtUserReturn(booking_id, driverId);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);


        // Emit socket event: driver arrived for return delivery
        try {
            const io = safeGetIO();
            if (io) {
                emitBookingArrivedForDelivery(io, booking_id, booking.userId.toString(), driverId, new Date());
            }
        } catch (socketErr) {
            logger.debug(`[ArriveUserReturn:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: "Arrived at delivery location.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        logger.error("Arrive At User Return Error:", err);
        return sendError(res, "Failed to update arrival status.");
    }
};

// CANCEL RIDE — Direct driver cancellation disabled, triggers Critical Support Request
export const cancelRideController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;
        const { reason = "" } = req.body;

        const result = await processDriverCancelRide(booking_id, driverId, reason);

        if (!result.success) {
            if (result.reason === "CRITICAL_CANCEL_REQUIRES_SUPPORT") {
                return sendResponse({
                    res,
                    statusCode: STATUS_CODES.OK,
                    message: result.message || "Direct cancellation is disabled. A critical support request has been created for the Support team to review.",
                    data: {
                        requiresSupport: true,
                        ticketId: result.ticketId,
                        ticketCode: result.ticketCode,
                        bookingId: result.bookingId,
                        leg: result.leg,
                    }
                });
            }

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
            message: "Cancellation request received and forwarded to Support.",
            data: { bookingId: result.bookingId, leg: result.leg },
        });
    } catch (err) {
        logger.error("Cancel Ride Error:", err);
        return sendError(res, "Failed to submit cancellation request.");
    }
};

// COMPLETE DELIVERY — luggage returned to user
export const completeDeliveryController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;
        const { otp } = req.body || {};
        let photos = [];
        if (req.files && req.files.length > 0) {
            const uploadResults = await uploadMultipleBuffers(req.files, {
                folder: CLOUDINARY_FOLDERS.BOOKINGS.DELIVERY,
            });
            photos = uploadResults.map(r => r.secure_url);
        }

        if (!otp) {
            return sendError(res, "Delivery OTP is required.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await processCompleteDelivery(booking_id, driverId, otp, photos);

        if (!booking) {
            return sendError(res, DRIVER_RIDE_MESSAGES.RIDE_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        await Promise.all([
            invalidateDriverCache(driverId, booking_id),
            invalidateBookingCache(booking.userId.toString(), booking_id),
        ]);


        // Emit socket event: delivery completed
        try {
            const io = safeGetIO();
            if (io) {
                const driver = await Driver.findById(driverId).select("first_name last_name").lean();
                const driverName = driver ? `${driver.first_name} ${driver.last_name}`.trim() : "Driver";
                emitBookingDelivered(io, booking_id, booking.userId.toString(), booking.storeId?.toString(), new Date(), driverName, driverId);
            }
        } catch (socketErr) {
            logger.debug(`[CompleteDelivery:Socket] Emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: "Delivery completed successfully.",
            data: { bookingId: booking._id, status: booking.status },
        });
    } catch (err) {
        if (err.message === "Invalid delivery OTP") {
            return sendError(res, err.message, STATUS_CODES.BAD_REQUEST);
        }
        logger.error("Complete Delivery Error:", err);
        return sendError(res, "Failed to complete delivery.");
    }
};

// GET DRIVER SETTLEMENT STATEMENT
export const getDriverSettlementController = async (req, res) => {
    try {
        const driverId = req.user.auth_id;
        const { booking_id } = req.params;
        const { format } = req.query;

        let cleanBookingId = booking_id;
        let requestedLeg = (req.query.type || req.query.rideType || req.query.leg || "").toLowerCase();

        if (booking_id.includes(":")) {
            const parts = booking_id.split(":");
            cleanBookingId = parts[0];
            if (!requestedLeg && parts[1]) {
                requestedLeg = parts[1].toLowerCase();
            }
        }

        if (!mongoose.isValidObjectId(cleanBookingId)) {
            return sendError(res, "Invalid booking or ride ID.", STATUS_CODES.BAD_REQUEST);
        }

        const { getDriverPickupSettlementData, getDriverReturnSettlementData, generateDriverStatementHTML } = await import("../../services/invoiceService.js");

        let settlement = null;

        if (requestedLeg === "return") {
            try {
                settlement = await getDriverReturnSettlementData(cleanBookingId, driverId);
            } catch {
                // Return settlement failed
            }
        } else if (requestedLeg === "pickup") {
            try {
                settlement = await getDriverPickupSettlementData(cleanBookingId, driverId);
            } catch {
                // Pickup settlement failed
            }
        } else {
            // Auto-detect based on driver assignment & completion
            try {
                settlement = await getDriverPickupSettlementData(cleanBookingId, driverId);
            } catch {
                // Not pickup driver
            }

            if (!settlement) {
                try {
                    settlement = await getDriverReturnSettlementData(cleanBookingId, driverId);
                } catch {
                    // Not return driver
                }
            }
        }

        if (!settlement) {
            return sendError(res, "Unauthorized or no settlement found for this driver ride.", STATUS_CODES.FORBIDDEN);
        }

        if (format === "html") {
            const html = generateDriverStatementHTML(settlement);
            res.setHeader("Content-Type", "text/html");
            return res.status(STATUS_CODES.OK).send(html);
        }

        return sendResponse({
            res,
            message: "Driver settlement statement fetched successfully.",
            data: { settlement },
        });
    } catch (err) {
        logger.error("Driver getDriverSettlementController Error:", err);
        return sendError(res, err.message || "Failed to fetch driver settlement statement.");
    }
};