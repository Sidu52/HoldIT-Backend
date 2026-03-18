import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { BOOKING_STATUS, JOB_QUEUES, STATUS_CODES } from "../../utils/constants.js";
import { addJobToQueue } from "../../services/jobService.js";
import {
    DRIVER_ASSIGN_QUEUE,
    DRIVER_JOB_NAMES,
} from "../../constants/user/booking.js";

import {
    BOOKING_CACHE,
    BOOKING_LIMITS,
    CANCELLABLE_STATUSES,
    RETURN_REQUESTABLE_STATUSES,
    ACTIVE_STATUSES,
    HISTORY_STATUSES,
    BOOKING_JOB_NAMES,
    BOOKING_SELECT,
    BOOKING_MESSAGES,
} from "../../constants/user/booking.js";

import {
    invalidateBookingCache,
    getCachedData,
    setCacheData,
    verifyUserForBooking,
    verifyServiceability,
    checkActiveBookingLimit,
    validateScheduledTime,
    calculateTotalLuggage,
    findUserBooking,
    findMutableUserBooking,
    buildPagination,
    createTimelineEntry,
    queueBookingJob,
    releaseStoreCapacity,
    findNearestAvailableStore,
    assignStoreToBooking,
    findStore,
} from "../../helpers/user/bookingHelper.js";
import { STORE_MESSAGES } from "../../constants/user/store.js";
import { DRIVER_MESSAGES } from "../../constants/user/driver.js";
import { safeAbortSession } from "../../utils/helper.js";

// SCHEDULE 
export const schedulePickup = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const { pickupLocation, pickupScheduledAt, luggage, notes } = req.body;

        // Verify user
        const { valid, errorType } = await verifyUserForBooking(userId, session);

        if (!valid) {
            await safeAbortSession(session);
            return sendError(
                res,
                errorType === "NOT_FOUND"
                    ? BOOKING_MESSAGES.USER_NOT_FOUND
                    : BOOKING_MESSAGES.ACCOUNT_NOT_ACTIVE,
                errorType === "NOT_FOUND"
                    ? STATUS_CODES.NOT_FOUND
                    : STATUS_CODES.FORBIDDEN
            );
        }

        // Check serviceability
        const serviceabilityResult = await verifyServiceability(
            pickupLocation.lat,
            pickupLocation.lng
        );

        if (!serviceabilityResult.isServiceable) {
            await safeAbortSession(session);

            if (serviceabilityResult.error === "DB_ERROR") {
                return sendError(res, BOOKING_MESSAGES.SCHEDULE_FAILED, STATUS_CODES.INTERNAL_SERVER_ERROR);
            }

            return sendError(res, BOOKING_MESSAGES.NOT_SERVICEABLE, STATUS_CODES.FORBIDDEN);
        }

        const { serviceAreaId } = serviceabilityResult;

        // Check active booking limit
        const { hasReachedLimit } = await checkActiveBookingLimit(userId, session);

        if (hasReachedLimit) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.MAX_ACTIVE_REACHED(BOOKING_LIMITS.MAX_ACTIVE_BOOKINGS),
                STATUS_CODES.CONFLICT
            );
        }

        // Scheduled time
        const scheduledTime = new Date(pickupScheduledAt);

        // Find nearest available store
        const { store, error: storeError } = await findNearestAvailableStore(
            pickupLocation.lat,
            pickupLocation.lng,
            session
        );

        if (!store) {
            await safeAbortSession(session);
            return sendError(
                res,
                storeError === "NO_STORE"
                    ? BOOKING_MESSAGES.NO_STORE_AVAILABLE
                    : BOOKING_MESSAGES.SCHEDULE_FAILED,
                storeError === "NO_STORE"
                    ? STATUS_CODES.NOT_FOUND
                    : STATUS_CODES.INTERNAL_SERVER_ERROR
            );
        }

        // Atomically reserve store capacity
        const { success: storeAssigned } = await assignStoreToBooking(
            store._id,
            session
        );

        if (!storeAssigned) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.STORE_AT_CAPACITY,
                STATUS_CODES.CONFLICT
            );
        }

        // Create booking
        const totalCount = calculateTotalLuggage(luggage);

        const [booking] = await Booking.create(
            [
                {
                    userId,
                    storeId: store._id,
                    serviceAreaId: serviceAreaId ?? store.service_area_id,
                    status: BOOKING_STATUS.STORE_ASSIGNED,
                    pickupLocation: {
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        address: pickupLocation.address ?? "",
                    },
                    luggage: {
                        ...luggage,
                        totalCount,
                    },
                    notes: notes ?? "",
                    pickup: {
                        scheduledAt: scheduledTime,
                    },
                    timeline: [
                        createTimelineEntry(
                            BOOKING_STATUS.CREATED,
                            "Booking created by user",
                            userId,
                            "User"
                        ),
                        createTimelineEntry(
                            BOOKING_STATUS.STORE_ASSIGNED,
                            `Store assigned: ${store.store_name}`,
                            null,
                            null
                        ),
                    ],
                },
            ],
            { session }
        );

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        try {
            await addJobToQueue(
                DRIVER_ASSIGN_QUEUE,
                {
                    name: DRIVER_JOB_NAMES.SEARCH_DRIVERS,
                    data: {
                        bookingId: booking._id.toString(),
                        type: "PICKUP",
                    },
                },
                {
                    jobId: `search-drivers-${booking._id}`,
                    delay: 2000,
                    removeOnComplete: true,
                    removeOnFail: { count: 50 },
                }
            );
        } catch (jobErr) {
            console.error(
                `[schedulePickup] ⚠️ Driver search job failed to queue for booking ` +
                `${booking._id}. Booking created but driver search not started.`,
                jobErr.message
            );
        }

        // Invalidate user booking cache
        await invalidateBookingCache(userId).catch((err) =>
            console.warn("[schedulePickup] Cache invalidation failed:", err.message)
        );

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: BOOKING_MESSAGES.PICKUP_SCHEDULED,
            data: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: booking.status,
                scheduledAt: scheduledTime,
                luggage: {
                    small: luggage.small ?? 0,
                    medium: luggage.medium ?? 0,
                    large: luggage.large ?? 0,
                    other: luggage.other ?? 0,
                    totalCount,
                },
                store: {
                    id: store._id,
                    name: store.store_name,
                    address: store.location,
                    distanceKm: parseFloat((store.distance / 1000).toFixed(2)),
                },
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("[schedulePickup] Unhandled error:", err);
        return sendError(res, BOOKING_MESSAGES.SCHEDULE_FAILED);
    }
};
// GET MY BOOKINGS
export const getMyBookings = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const {
            page = 1,
            limit = 10,
            status,
            sort_order = "desc",
        } = req.validated?.query || req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        const cacheKey = BOOKING_CACHE.LIST_KEY(userId, pageNum, limitNum, status, sort_order);
        const cached = await getCachedData(cacheKey);

        // if (cached) {
        //     return sendResponse({
        //         res,
        //         message: BOOKING_MESSAGES.BOOKINGS_FETCHED,
        //         data: cached,
        //     });
        // }

        const filter = { userId };
        if (status) filter.status = status;

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select(BOOKING_SELECT.LIST)
                .sort({ createdAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const responseData = {
            bookings,
            pagination: buildPagination(pageNum, limitNum, total),
        };

        await setCacheData(cacheKey, responseData, BOOKING_CACHE.LIST_TTL);

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.BOOKINGS_FETCHED,
            data: responseData,
        });
    } catch (err) {
        console.error("Get My Bookings Error:", err);
        return sendError(res, BOOKING_MESSAGES.FETCH_FAILED);
    }
};

// GET BOOKING BY ID
export const getBookingById = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;
        const cacheKey = BOOKING_CACHE.DETAIL_KEY(userId, booking_id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: BOOKING_MESSAGES.BOOKING_FETCHED,
                data: cached,
            });
        }
        const booking = await findUserBooking(booking_id, userId, BOOKING_SELECT.DETAIL);

        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }
        await setCacheData(cacheKey, booking, BOOKING_CACHE.DETAIL_TTL);

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.BOOKING_FETCHED,
            data: booking,
        });
    } catch (err) {
        console.error("Get Booking By ID Error:", err);
        return sendError(res, BOOKING_MESSAGES.FETCH_DETAIL_FAILED);
    }
};

// CANCEL BOOKING
export const cancelBooking = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const userId = req.user.auth_id;
        const { booking_id } = req.params;
        const { reason } = req.body;

        const booking = await Booking.findOne({
            _id: booking_id,
            userId,
        })
            .select(BOOKING_SELECT.CANCEL + " storeId payment pricing")
            .session(session);

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }
        if (!CANCELLABLE_STATUSES.includes(booking.status)) {
            await safeAbortSession(session);
            return sendError(
                res,
                BOOKING_MESSAGES.CANNOT_CANCEL(booking.status),
                STATUS_CODES.CONFLICT
            );
        }
        booking.status = BOOKING_STATUS.CANCELLED;
        booking.isActive = false;
        booking.cancelledAt = new Date();
        booking.cancelledBy = "USER";
        booking.cancelReason = reason;
        booking.payment.status = "pending";

        booking.timeline.push(
            createTimelineEntry(
                BOOKING_STATUS.CANCELLED,
                `Cancelled by user: ${reason}`,
                userId,
                "User"
            )
        );

        await booking.save({ session });
        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session);
        }

        await session.commitTransaction();
        session.endSession();
        await invalidateBookingCache(userId, booking_id);
        queueBookingJob(
            JOB_QUEUES.BOOKING_CANCELLED,
            BOOKING_JOB_NAMES.BOOKING_CANCELLED,
            {
                bookingId: booking_id,
                userId,
                reason,
                cancelledBy: "USER",
                type: "USER_CANCEL",
            }
        );

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.BOOKING_CANCELLED,
            data: {
                bookingId: booking._id,
                status: booking.status,
                cancelledAt: booking.cancelledAt,
            },
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("Cancel Booking Error:", err);
        return sendError(res, BOOKING_MESSAGES.CANCEL_FAILED);
    }
};

// GET ACTIVE BOOKINGS
export const getActiveBookings = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const cacheKey = `user_active_bookings:${userId}`;
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: BOOKING_MESSAGES.ACTIVE_FETCHED,
                data: cached,
            });
        }
        const bookings = await Booking.find({
            userId,
            status: { $in: ACTIVE_STATUSES },
        })
            .select(BOOKING_SELECT.LIST)
            .sort({ createdAt: -1 })
            .lean();

        const responseData = {
            bookings,
            total: bookings.length,
        };

        await setCacheData(cacheKey, responseData, BOOKING_CACHE.LIST_TTL);

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.ACTIVE_FETCHED,
            data: responseData,
        });
    } catch (err) {
        console.error("Get Active Bookings Error:", err);
        return sendError(res, BOOKING_MESSAGES.ACTIVE_FETCH_FAILED);
    }
};

// GET BOOKING HISTORY
export const getBookingHistory = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { page = 1, limit = 10, sort_order = "desc" } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;
        const cacheKey = `user_booking_history:${userId}:${pageNum}:${limitNum}:${sort_order}`;
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: BOOKING_MESSAGES.HISTORY_FETCHED,
                data: cached,
            });
        }

        const filter = {
            userId,
            status: { $in: HISTORY_STATUSES },
        };

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select(BOOKING_SELECT.LIST + " cancelledAt cancelledBy cancelReason")
                .sort({ createdAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const responseData = {
            bookings,
            pagination: buildPagination(pageNum, limitNum, total),
        };

        await setCacheData(cacheKey, responseData, BOOKING_CACHE.LIST_TTL);

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.HISTORY_FETCHED,
            data: responseData,
        });
    } catch (err) {
        console.error("Get Booking History Error:", err);
        return sendError(res, BOOKING_MESSAGES.HISTORY_FETCH_FAILED);
    }
};

// REQUEST RETURN
export const requestReturn = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;
        const { returnLocation, returnScheduledAt, notes } = req.body;

        // Find booking
        const booking = await findMutableUserBooking(
            booking_id,
            userId,
            BOOKING_SELECT.RETURN
        );

        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        // Validate status
        if (!RETURN_REQUESTABLE_STATUSES.includes(booking.status)) {
            return sendError(
                res,
                BOOKING_MESSAGES.CANNOT_RETURN(booking.status),
                STATUS_CODES.CONFLICT
            );
        }

        // Validate return time
        const { valid: timeValid, scheduledTime: returnTime } = validateScheduledTime(
            returnScheduledAt,
            BOOKING_LIMITS.MIN_RETURN_LEAD_MINUTES
        );

        if (!timeValid) {
            return sendError(
                res,
                BOOKING_MESSAGES.RETURN_TOO_SOON(BOOKING_LIMITS.MIN_RETURN_LEAD_MINUTES),
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Update booking
        booking.status = BOOKING_STATUS.RETURN_REQUESTED;
        booking.deliveryLocation = {
            lat: returnLocation.lat,
            lng: returnLocation.lng,
            address: returnLocation.address || "",
        };
        booking.delivery = {
            ...booking.delivery,
            requestedAt: new Date(),
            scheduledAt: returnTime,
        };

        booking.timeline.push(
            createTimelineEntry(
                BOOKING_STATUS.RETURN_REQUESTED,
                notes ? `Return requested by user: ${notes}` : "Return requested by user",
                userId,
                "User"
            )
        );

        await booking.save();

        await invalidateBookingCache(userId, booking_id);

        queueBookingJob(
            JOB_QUEUES.RETURN_PROCESS,
            BOOKING_JOB_NAMES.PROCESS_RETURN,
            { bookingId: booking_id }
        );

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.RETURN_REQUESTED,
            data: {
                bookingId: booking._id,
                status: booking.status,
                returnScheduledAt: returnTime,
            },
        });
    } catch (err) {
        console.error("Request Return Error:", err);
        return sendError(res, BOOKING_MESSAGES.RETURN_FAILED);
    }
};

// Get Assign Driver
export const getAssignDriver = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await findMutableUserBooking(
            booking_id,
            userId,
            BOOKING_SELECT.ASSIGN_DRIVER
        );
        if (!booking) {
            return sendError(res, BOOKING_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        if (!booking.driverId) {
            return sendError(
                res,
                DRIVER_MESSAGES.DRIVER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const driver = await findDriver(booking.driverId, BOOKING_SELECT.DETAIL);
        if (!driver) {
            return sendError(
                res,
                DRIVER_MESSAGES.DRIVER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        return sendResponse({
            res,
            message: BOOKING_MESSAGES.ASSIGN_DRIVER,
            data: {
                bookingId: booking._id,
                status: booking.status,
                store: {
                    driverId: driver._id,
                },
                assignedAt: booking.assignedAt,
                acceptedAt: booking.acceptedAt,
                completedAt: booking.completedAt,
            },
        });
    } catch (err) {
        console.error("Assign Driver Error:", err);
        return sendError(res, BOOKING_MESSAGES.ASSIGN_DRIVER_FAILED);
    }
};

// Get Assign Store
export const getAssignStore = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { booking_id } = req.params;

        const booking = await findMutableUserBooking(
            booking_id,
            userId,
            BOOKING_SELECT.ASSIGN_STORE
        );

        if (!booking) {
            return sendError(
                res,
                BOOKING_MESSAGES.BOOKING_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        if (!booking.storeId) {
            return sendError(
                res,
                BOOKING_MESSAGES.STORE_NOT_ASSIGNED,
                STATUS_CODES.NOT_FOUND
            );
        }

        const store = await findStore(booking.storeId, userId, BOOKING_SELECT.DETAIL);
        if (!store) {
            return sendError(
                res,
                STORE_MESSAGES.STORE_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }
        return sendResponse({
            res,
            message: BOOKING_MESSAGES.ASSIGN_STORE_DETAILS,
            data: {
                bookingId: booking._id,
                status: booking.status,
                store: {
                    storeId: store._id,
                    name: store.store_name,
                    phone: store.store_contact_number,
                    address: store.location,
                },
                assignedAt: booking.assignedAt,
                acceptedAt: booking.acceptedAt,
                completedAt: booking.completedAt,
            },
        });

    } catch (err) {
        console.error("Get Assign Store Error:", err);
        return sendError(
            res,
            BOOKING_MESSAGES.GET_ASSIGN_STORE_FAILED
        );
    }
};

