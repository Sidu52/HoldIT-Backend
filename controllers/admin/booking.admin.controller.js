import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del, delByPattern } from "../../services/redisService.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import mongoose from "mongoose";
import { safeAbortSession } from "../../utils/helper.js";
import Driver from "../../models/Driver.js";
import { assignStoreToBooking } from "../../helpers/user/bookingHelper.js";
import Store from "../../models/Store.js";
import User from "../../models/User.js";

// CONSTANTS
const LIST_CACHE_TTL = 120; // 2 minutes
const DETAIL_CACHE_TTL = 300; // 5 minutes
const EXCLUDED_FIELDS = "-__v";

// Build Cache Key
const buildCacheKey = (prefix, params) => {
    const parts = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`);

    return `${prefix}:${parts.join(":")}`;
};

// Escape Regex
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET BOOKINGS (Paginated + Filtered)
export const getBookings = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            userId,
            storeId,
            serviceAreaId,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
            from_date,
            to_date,
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = {};

        if (status)        filter.status = status;
        if (storeId)       filter.storeId = storeId;
        if (serviceAreaId) filter.serviceAreaId = serviceAreaId;

        if (userId) {
            filter.userId = userId;
        }

        if (search) {
            const escaped = escapeRegex(search.trim());
            const searchRegex = { $regex: escaped, $options: "i" };

            // Step 1a: find matching users by name or phone
            const matchingUsers = await User.find({
                $or: [
                    { first_name: searchRegex },
                    { last_name:  searchRegex },
                    { phone:      searchRegex },
                ],
            })
                .select("_id")
                .limit(200) 
                .lean();

            const matchingStores = await Store.find({
                store_name: searchRegex,
            })
                .select("_id")
                .limit(100)
                .lean();

            const userIds  = matchingUsers.map((u) => u._id);
            const storeIds = matchingStores.map((s) => s._id);

            filter.$or = [
                { bookingCode: searchRegex },
                ...(userIds.length  ? [{ userId:  { $in: userIds } }]  : []),
                ...(storeIds.length ? [{ storeId: { $in: storeIds } }] : []),
            ];

            // If nothing could possibly match return empty early
            if (filter.$or.length === 0) {
                return sendResponse({
                    res,
                    message: "Bookings fetched successfully",
                    data: {
                        bookings: [],
                        pagination: {
                            currentPage: pageNum,
                            totalPages: 0,
                            totalItems: 0,
                            itemsPerPage: limitNum,
                            hasNextPage: false,
                            hasPrevPage: false,
                        },
                    },
                });
            }
        }

        // Date range filter
        if (from_date || to_date) {
            filter.createdAt = {};
            if (from_date) {
                filter.createdAt.$gte = new Date(from_date);
            }
            if (to_date) {
                const endDate = new Date(to_date);
                endDate.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = endDate;
            }
        }

        const sortDirection = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDirection };

        const cacheKey = buildCacheKey("bookings", {
            page: pageNum, limit: limitNum,
            status, userId, storeId, serviceAreaId,
            search, sort_by, sort_order,
            from_date, to_date,
        });

        // sub-queries that won't be reflected in a stale cache key
        if (!search) {
            const cached = await get(cacheKey);
            if (cached) {
                return sendResponse({
                    res,
                    message: "Bookings fetched successfully",
                    data: JSON.parse(cached),
                });
            }
        }

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select(EXCLUDED_FIELDS)
                .populate("userId",  "first_name last_name phone email")
                .populate("storeId", "store_name store_contact_number")
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);

        const responseData = {
            bookings,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
            },
        };

        // Only cache non-search queries
        if (!search) {
            await set(cacheKey, JSON.stringify(responseData), "EX", LIST_CACHE_TTL);
        }

        return sendResponse({
            res,
            message: "Bookings fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("[getBookings] Error:", err);
        return sendError(res, "Failed to fetch bookings");
    }
};

// GET BOOKING BY ID
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = `booking:${id}`;

        // Check cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Booking fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const booking = await Booking.findById(id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!booking) {
            return sendError(
                res,
                "Booking not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Cache result
        await set(cacheKey, JSON.stringify(booking), "EX", DETAIL_CACHE_TTL);

        return sendResponse({
            res,
            message: "Booking fetched successfully",
            data: booking,
        });
    } catch (err) {
        console.error("Get Booking By ID Error:", err);
        return sendError(res, "Failed to fetch booking");
    }
};

// Cancel Booking
export const cancelBooking = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { id } = req.params;
        const { auth_id } = req.user;

        // Fetch current booking with all needed fields
        const booking = await Booking.findById(id)
            .select("status userId storeId")
            .session(session)
            .lean();

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        // Prevent cancelling already-cancelled bookings
        if (booking.status === BOOKING_STATUS.CANCELLED) {
            await safeAbortSession(session);
            return sendError(res, "Booking is already cancelled", STATUS_CODES.BAD_REQUEST);
        }

        // Build update
        const updateData = {
            status: BOOKING_STATUS.CANCELLED,
            updated_at: new Date(),
            status_updated_by: auth_id,
            cancellation_reason: "Admin requested cancellation",
            cancelled_at: new Date(),
            cancelled_by: auth_id,
            $push: {
                timeline: createTimelineEntry(
                    BOOKING_STATUS.CANCELLED,
                    "Booking cancelled by admin",
                    auth_id,
                    "Admin"
                ),
            },
        };

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true, session }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Release store capacity back
        if (booking.storeId) {
            await releaseStoreCapacity(booking.storeId, session).catch((err) =>
                console.warn("[cancelBooking] Store capacity release failed:", err.message)
            );
        }

        await session.commitTransaction();
        session.endSession();

        // Cancel all queued/active worker jobs for this booking
        try {
            const jobsToRemove = [
                `search-drivers-${id}`,
                `assign-driver-${id}`,
                `pickup-${id}`,
                `delivery-${id}`,
            ];

            await Promise.allSettled(
                jobsToRemove.map((jobId) =>
                    removeJobFromQueue(DRIVER_ASSIGN_QUEUE, jobId).catch((err) =>
                        console.warn(`[cancelBooking] Failed to remove job ${jobId}:`, err.message)
                    )
                )
            );
        } catch (jobErr) {
            // Non-fatal — booking is already cancelled in DB
            console.error(
                `[cancelBooking] Job cancellation failed for booking ${id}. ` +
                `Booking cancelled but some jobs may still be queued.`,
                jobErr.message
            );
        }

        // Invalidate user booking cache
        await invalidateBookingCache(booking.userId).catch((err) =>
            console.warn("[cancelBooking] Cache invalidation failed:", err.message)
        );

        return sendResponse({
            res,
            message: "Booking cancelled successfully",
            data: updatedBooking,
        });

    } catch (err) {
        await safeAbortSession(session);
        console.error("[cancelBooking] Unhandled error:", err);
        return sendError(res, "Failed to cancel booking");
    }
};

export const assignDriver = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { id } = req.params;
        const { driverId } = req.body;
        const { auth_id } = req.user;

        const booking = await Booking.findById(id)
            .select("status userId driverId")
            .session(session)
            .lean();

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        // Only allowed from STORE_ASSIGNED
        if (!isValidStatusTransition(booking.status, BOOKING_STATUS.DRIVER_ASSIGNED)) {
            await safeAbortSession(session);
            return sendError(
                res,
                `Cannot assign driver from status: ${booking.status}`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        const driver = await Driver.findById(driverId)
            .select("is_active is_available name")
            .session(session)
            .lean();

        if (!driver || !driver.is_active || !driver.is_available) {
            await safeAbortSession(session);
            return sendError(res, "Driver not available", STATUS_CODES.BAD_REQUEST);
        }

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: BOOKING_STATUS.DRIVER_ASSIGNED,
                    driverId,
                    updated_at: new Date(),
                    status_updated_by: auth_id,
                },
                $push: {
                    timeline: createTimelineEntry(
                        BOOKING_STATUS.DRIVER_ASSIGNED,
                        `Driver manually assigned by admin: ${driver.name}`,
                        auth_id,
                        "Admin"
                    ),
                },
            },
            { new: true, runValidators: true, session }
        ).select(EXCLUDED_FIELDS).lean();

        await session.commitTransaction();
        session.endSession();

        // Cancel any pending auto-search jobs for this booking
        await removeJobFromQueue(DRIVER_ASSIGN_QUEUE, `search-drivers-${id}`)
            .catch((err) => console.warn("[assignDriver] Job removal failed:", err.message));

        await invalidateBookingCache(booking.userId)
            .catch((err) => console.warn("[assignDriver] Cache invalidation failed:", err.message));

        return sendResponse({
            res,
            message: "Driver assigned successfully",
            data: updatedBooking,
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("[assignDriver] Error:", err);
        return sendError(res, "Failed to assign driver");
    }
};

export const reassignDriver = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { id } = req.params;
        const { driverId } = req.body;
        const { auth_id } = req.user;

        const booking = await Booking.findById(id)
            .select("status userId driverId")
            .session(session)
            .lean();

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        // Must already be DRIVER_ASSIGNED to reassign
        if (booking.status !== BOOKING_STATUS.DRIVER_ASSIGNED) {
            await safeAbortSession(session);
            return sendError(
                res,
                `Cannot reassign driver from status: ${booking.status}`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        if (booking.driverId?.toString() === driverId) {
            await safeAbortSession(session);
            return sendError(res, "Driver is already assigned to this booking", STATUS_CODES.BAD_REQUEST);
        }

        const driver = await Driver.findById(driverId)
            .select("is_active is_available name")
            .session(session)
            .lean();

        if (!driver || !driver.is_active || !driver.is_available) {
            await safeAbortSession(session);
            return sendError(res, "Driver not available", STATUS_CODES.BAD_REQUEST);
        }

        const previousDriverId = booking.driverId;

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            {
                $set: {
                    driverId,
                    updated_at: new Date(),
                    status_updated_by: auth_id,
                    // Status stays DRIVER_ASSIGNED — no transition needed
                },
                $push: {
                    timeline: createTimelineEntry(
                        BOOKING_STATUS.DRIVER_ASSIGNED,
                        `Driver reassigned by admin from ${previousDriverId} to ${driverId}`,
                        auth_id,
                        "Admin"
                    ),
                },
            },
            { new: true, runValidators: true, session }
        ).select(EXCLUDED_FIELDS).lean();

        await session.commitTransaction();
        session.endSession();

        // Cancel any stale jobs tied to old driver search
        await removeJobFromQueue(DRIVER_ASSIGN_QUEUE, `search-drivers-${id}`)
            .catch((err) => console.warn("[reassignDriver] Job removal failed:", err.message));

        await invalidateBookingCache(booking.userId)
            .catch((err) => console.warn("[reassignDriver] Cache invalidation failed:", err.message));

        return sendResponse({
            res,
            message: "Driver reassigned successfully",
            data: updatedBooking,
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("[reassignDriver] Error:", err);
        return sendError(res, "Failed to reassign driver");
    }
};

export const reassignStore = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { id } = req.params;
        const { storeId } = req.body;
        const { auth_id } = req.user;

        const booking = await Booking.findById(id)
            .select("status userId storeId")
            .session(session)
            .lean();

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        // Only valid before driver is assigned
        const reassignableStatuses = [BOOKING_STATUS.CREATED, BOOKING_STATUS.STORE_ASSIGNED];
        if (!reassignableStatuses.includes(booking.status)) {
            await safeAbortSession(session);
            return sendError(
                res,
                `Cannot reassign store from status: ${booking.status}`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        if (booking.storeId?.toString() === storeId) {
            await safeAbortSession(session);
            return sendError(res, "Store is already assigned to this booking", STATUS_CODES.BAD_REQUEST);
        }

        // Release old store capacity
        await releaseStoreCapacity(booking.storeId, session);

        // Assign new store capacity
        const { success: storeAssigned } = await assignStoreToBooking(storeId, session);
        if (!storeAssigned) {
            await safeAbortSession(session);
            return sendError(res, BOOKING_MESSAGES.STORE_AT_CAPACITY, STATUS_CODES.CONFLICT);
        }

        const store = await Store.findById(storeId)
            .select("store_name")
            .session(session)
            .lean();

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            {
                $set: {
                    storeId,
                    status: BOOKING_STATUS.STORE_ASSIGNED,
                    updated_at: new Date(),
                    status_updated_by: auth_id,
                },
                $push: {
                    timeline: createTimelineEntry(
                        BOOKING_STATUS.STORE_ASSIGNED,
                        `Store reassigned by admin: ${store.store_name}`,
                        auth_id,
                        "Admin"
                    ),
                },
            },
            { new: true, runValidators: true, session }
        ).select(EXCLUDED_FIELDS).lean();

        await session.commitTransaction();
        session.endSession();

        await invalidateBookingCache(booking.userId)
            .catch((err) => console.warn("[reassignStore] Cache invalidation failed:", err.message));

        return sendResponse({
            res,
            message: "Store reassigned successfully",
            data: updatedBooking,
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("[reassignStore] Error:", err);
        return sendError(res, "Failed to reassign store");
    }
};

// Factory to avoid repeating the same pattern 5 times
const createStatusProgressController = ({ 
    fromStatus, 
    toStatus, 
    successMessage, 
    timelineMessage,
    controllerName 
}) => {
    return async (req, res) => {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const { id } = req.params;
            const { auth_id } = req.user;

            const booking = await Booking.findById(id)
                .select("status userId")
                .session(session)
                .lean();

            if (!booking) {
                await safeAbortSession(session);
                return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
            }

            if (!isValidStatusTransition(booking.status, toStatus)) {
                await safeAbortSession(session);
                return sendError(
                    res,
                    `Cannot transition to ${toStatus} from status: ${booking.status}`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            const updatedBooking = await Booking.findByIdAndUpdate(
                id,
                {
                    $set: {
                        status: toStatus,
                        updated_at: new Date(),
                        status_updated_by: auth_id,
                    },
                    $push: {
                        timeline: createTimelineEntry(
                            toStatus,
                            timelineMessage,
                            auth_id,
                            "Admin"
                        ),
                    },
                },
                { new: true, runValidators: true, session }
            ).select(EXCLUDED_FIELDS).lean();

            await session.commitTransaction();
            session.endSession();

            await invalidateBookingCache(booking.userId)
                .catch((err) => console.warn(`[${controllerName}] Cache invalidation failed:`, err.message));

            return sendResponse({
                res,
                message: successMessage,
                data: updatedBooking,
            });
        } catch (err) {
            await safeAbortSession(session);
            console.error(`[${controllerName}] Error:`, err);
            return sendError(res, `Failed to update booking status`);
        }
    };
};
 
export const markDriverArrived = createStatusProgressController({
    fromStatus: BOOKING_STATUS.DRIVER_ASSIGNED,
    toStatus: BOOKING_STATUS.DRIVER_ARRIVED,
    successMessage: "Driver marked as arrived",
    timelineMessage: "Driver arrived at pickup location (admin)",
    controllerName: "markDriverArrived",
});

export const markPickedUp = createStatusProgressController({
    fromStatus: BOOKING_STATUS.DRIVER_ARRIVED,
    toStatus: BOOKING_STATUS.PICKED_UP,
    successMessage: "Booking marked as picked up",
    timelineMessage: "Luggage picked up by driver (admin)",
    controllerName: "markPickedUp",
});

export const markStored = createStatusProgressController({
    fromStatus: BOOKING_STATUS.PICKED_UP,
    toStatus: BOOKING_STATUS.STORED,
    successMessage: "Booking marked as stored",
    timelineMessage: "Luggage stored at facility (admin)",
    controllerName: "markStored",
});

export const requestReturn = createStatusProgressController({
    fromStatus: BOOKING_STATUS.STORED,
    toStatus: BOOKING_STATUS.RETURN_REQUESTED,
    successMessage: "Return requested successfully",
    timelineMessage: "Return requested by admin",
    controllerName: "requestReturn",
});

export const markDelivered = createStatusProgressController({
    fromStatus: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
    toStatus: BOOKING_STATUS.DELIVERED,
    successMessage: "Booking marked as delivered",
    timelineMessage: "Luggage delivered to customer (admin)",
    controllerName: "markDelivered",
});

export const assignReturnDriver = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { id } = req.params;
        const { driverId } = req.body;
        const { auth_id } = req.user;

        const booking = await Booking.findById(id)
            .select("status userId")
            .session(session)
            .lean();

        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }

        if (!isValidStatusTransition(booking.status, BOOKING_STATUS.RETURN_DRIVER_ASSIGNED)) {
            await safeAbortSession(session);
            return sendError(
                res,
                `Cannot assign return driver from status: ${booking.status}`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        const driver = await Driver.findById(driverId)
            .select("is_active is_available name")
            .session(session)
            .lean();

        if (!driver || !driver.is_active || !driver.is_available) {
            await safeAbortSession(session);
            return sendError(res, "Driver not available", STATUS_CODES.BAD_REQUEST);
        }

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                    returnDriverId: driverId,
                    updated_at: new Date(),
                    status_updated_by: auth_id,
                },
                $push: {
                    timeline: createTimelineEntry(
                        BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                        `Return driver assigned by admin: ${driver.name}`,
                        auth_id,
                        "Admin"
                    ),
                },
            },
            { new: true, runValidators: true, session }
        ).select(EXCLUDED_FIELDS).lean();

        await session.commitTransaction();
        session.endSession();

        await invalidateBookingCache(booking.userId)
            .catch((err) => console.warn("[assignReturnDriver] Cache invalidation failed:", err.message));

        return sendResponse({
            res,
            message: "Return driver assigned successfully",
            data: updatedBooking,
        });
    } catch (err) {
        await safeAbortSession(session);
        console.error("[assignReturnDriver] Error:", err);
        return sendError(res, "Failed to assign return driver");
    }
};

// UPDATE BOOKING STATUS
export const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        const { auth_id, role } = req.user;
        // Fetch current booking
        const booking = await Booking.findById(id)
            .select("status")
            .lean();

        if (!booking) {
            return sendError(
                res,
                "Booking not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Prevent setting same status
        if (booking.status === status) {
            return sendError(
                res,
                `Booking is already ${status}`,
                STATUS_CODES.CONFLICT
            );
        }

        // Validate status transition
        const validTransition = isValidStatusTransition(
            booking.status,
            status
        );
        if (!validTransition) {
            return sendError(
                res,
                `Cannot transition from "${booking.status}" to "${status}"`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Build update
        const updateData = {
            status,
            updated_at: new Date(),
            status_updated_by: auth_id,
        };

        if (status === BOOKING_STATUS.CANCELLED && reason) {
            updateData.cancellation_reason = reason;
            updateData.cancelled_at = new Date();
            updateData.cancelled_by = auth_id;
        }

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        // Invalidate caches
        await Promise.all([
            del(`booking:${id}`),
            delByPattern("bookings:*"),
        ]);

        return sendResponse({
            res,
            message: `Booking status updated to ${status}`,
            data: updatedBooking,
        });
    } catch (err) {
        console.error("Update Booking Status Error:", err);
        return sendError(res, "Failed to update booking status");
    }
};

// Validate Status Transitions
const VALID_TRANSITIONS = {
    [BOOKING_STATUS.CREATED]: [
        BOOKING_STATUS.STORE_ASSIGNED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.STORE_ASSIGNED]: [
       BOOKING_STATUS.DRIVER_ASSIGNED,,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.DRIVER_ASSIGNED]: [
        BOOKING_STATUS.DRIVER_ARRIVED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.DRIVER_ARRIVED]: [
        BOOKING_STATUS.PICKED_UP,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.PICKED_UP]: [
        BOOKING_STATUS.STORED,
    ],
    [BOOKING_STATUS.STORED]: [
        BOOKING_STATUS.RETURN_REQUESTED,
    ],
    [BOOKING_STATUS.RETURN_REQUESTED]: [
        BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.RETURN_DRIVER_ASSIGNED]: [
        BOOKING_STATUS.DELIVERED,
    ],
    [BOOKING_STATUS.DELIVERED]: [],    // Terminal state
    [BOOKING_STATUS.CANCELLED]: [],    // Terminal state
};

const isValidStatusTransition = (currentStatus, newStatus) => {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) return false;
    return allowed.includes(newStatus);
};