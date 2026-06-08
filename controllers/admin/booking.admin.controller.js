import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import User from "../../models/User.js";
import mongoose from "mongoose";
import { assignStoreToBooking } from "../../helpers/user/bookingHelper.js";
import logger from "../../utils/logger.js";
import { getIO } from "../../src/socket/index.js";
import { getCache, setCache, deleteCache, deleteByPattern, buildCacheKey } from "../../utils/cache.js";
import { STATUS_CODES, BOOKING_STATUS, ACCOUNT_STATUS, CACHE_TTL } from "../../utils/constants.js";
import {
    emitBookingCancelled, emitBookingDriverAssigned, emitBookingStoreAssigned,
    emitBookingReturnDriverAssigned, emitBookingDriverArrived, emitBookingPickedUp,
    emitBookingStored, emitBookingReturnRequested, emitBookingDelivered,
} from "../../src/socket/emitters/booking.emitter.js";

const MAX_LIMIT = 100;
const ALLOWED_SORT_FIELDS = new Set(["createdAt", "status", "userId", "storeId", "serviceAreaId", "updatedAt", "bookingCode"]);
const EXCLUDED_FIELDS = "-__v";
const LIST_CACHE_TTL = CACHE_TTL.LIST;
const DETAIL_CACHE_TTL = CACHE_TTL.DETAIL;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// -------------------------
// Helpers
// -------------------------
const bookingCacheKey = (id) => buildCacheKey("booking", { id: String(id) });
const bookingListPattern = "bookings:*";

const createTimelineEntry = (status, note, actorId, role = "Admin") => ({
    status, note, updatedBy: actorId, role, timestamp: new Date(),
});

const invalidateBookingCache = async (bookingId, userId) => {
    await Promise.allSettled([
        deleteCache(bookingCacheKey(bookingId)),
        deleteByPattern(bookingListPattern),
        userId && deleteByPattern(`bookings:*userId=${userId}*`),
    ].filter(Boolean));
};

const releaseStoreCapacity = (storeId, session) =>
    storeId ? Store.findByIdAndUpdate(storeId, { $inc: { current_capacity: -1 } }, { session }) : null;

const safeAbortSession = async (session) => {
    try { await session.abortTransaction(); session.endSession(); } catch (_) { }
};

const withSession = async (res, controllerName, fn) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        return await fn(session);
    } catch (err) {
        await safeAbortSession(session);
        logger.error(`[${controllerName}] Error:`, err);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update booking status" });
    }
};

const fetchAvailableDriver = async (driverId, session) => {
    const driver = await Driver.findById(driverId)
        .select("account_status is_online is_on_trip name first_name last_name phone vehicle_details")
        .session(session).lean();

    if (!driver || driver.account_status !== ACCOUNT_STATUS.ACTIVE || !driver.is_online || driver.is_on_trip) {
        return null;
    }
    return driver;
};

const emitSocketEvent = (toStatus, io, id, booking, extra = {}) => {
    const { userId, storeId, deliveryLocation, delivery, pickup } = booking;
    const driverName = (d) => d ? `${d.first_name || ""} ${d.last_name || ""}`.trim() : "Driver";

    switch (toStatus) {
        case BOOKING_STATUS.DRIVER_ARRIVED:
            return emitBookingDriverArrived(io, id, userId, pickup?.assignment?.driverId?._id || pickup?.assignment?.driverId, new Date());
        case BOOKING_STATUS.PICKED_UP:
            return emitBookingPickedUp(io, id, userId, storeId?._id || storeId, new Date(), driverName(pickup?.assignment?.driverId));
        case BOOKING_STATUS.STORED:
            return emitBookingStored(io, id, userId, new Date(), storeId?.store_name || "Store");
        case BOOKING_STATUS.RETURN_REQUESTED:
            return emitBookingReturnRequested(io, id, userId, storeId?._id || storeId, deliveryLocation, delivery?.scheduledAt || delivery?.requestedAt || new Date());
        case BOOKING_STATUS.DELIVERED:
            return emitBookingDelivered(io, id, userId, storeId?._id || storeId, new Date(), driverName(delivery?.assignment?.driverId));
        case BOOKING_STATUS.DRIVER_ASSIGNED:
            return emitBookingDriverAssigned(io, id, userId, extra.driver);
        case BOOKING_STATUS.RETURN_DRIVER_ASSIGNED:
            return emitBookingReturnDriverAssigned(io, id, userId, extra.driver);
        case BOOKING_STATUS.STORE_ASSIGNED:
            return emitBookingStoreAssigned(io, id, userId, extra.store);
        case BOOKING_STATUS.CANCELLED:
            return emitBookingCancelled(io, id, userId, storeId, extra.driverId, "ADMIN", extra.reason, new Date());
    }
};

const tryEmit = async (toStatus, bookingId, bookingData, extra = {}) => {
    try {
        const io = getIO();
        // For status progressions that need populated data, re-fetch
        const needsPopulate = [BOOKING_STATUS.DRIVER_ARRIVED, BOOKING_STATUS.PICKED_UP, BOOKING_STATUS.STORED, BOOKING_STATUS.RETURN_REQUESTED, BOOKING_STATUS.DELIVERED].includes(toStatus);

        if (needsPopulate) {
            const populated = await Booking.findById(bookingId)
                .select("status userId storeId pickup.assignment.driverId delivery.assignment.driverId deliveryLocation delivery.scheduledAt delivery.requestedAt")
                .populate("storeId", "store_name")
                .populate("pickup.assignment.driverId", "first_name last_name")
                .populate("delivery.assignment.driverId", "first_name last_name")
                .lean();
            if (populated) emitSocketEvent(toStatus, io, bookingId, populated, extra);
        } else {
            emitSocketEvent(toStatus, io, bookingId, bookingData, extra);
        }
    } catch (err) {
        logger.warn(`[Socket] Failed to emit (${toStatus}):`, err.message);
    }
};

// GET BOOKINGS
export const getBookings = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, status, userId, storeId, serviceAreaId, search,
            sort_by = "createdAt", sort_order = "desc", from_date, to_date,
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || 10));
        const safeSortField = ALLOWED_SORT_FIELDS.has(sort_by) ? sort_by : "createdAt";

        const filter = {
            ...(status && { status }),
            ...(storeId && { storeId }),
            ...(serviceAreaId && { serviceAreaId }),
            ...(userId && { userId }),
        };

        if (from_date || to_date) {
            filter.createdAt = {
                ...(from_date && { $gte: new Date(from_date) }),
                ...(to_date && { $lte: Object.assign(new Date(to_date), { _: new Date(to_date).setHours(23, 59, 59, 999) }) }),
            };
        }

        if (search) {
            const searchRegex = { $regex: escapeRegex(search.trim()), $options: "i" };
            const [matchingUsers, matchingStores] = await Promise.all([
                User.find({ $or: [{ first_name: searchRegex }, { last_name: searchRegex }, { phone: searchRegex }] }).select("_id").limit(200).lean(),
                Store.find({ store_name: searchRegex }).select("_id").limit(100).lean(),
            ]);
            filter.$or = [
                { bookingCode: searchRegex },
                ...(matchingUsers.length ? [{ userId: { $in: matchingUsers.map((u) => u._id) } }] : []),
                ...(matchingStores.length ? [{ storeId: { $in: matchingStores.map((s) => s._id) } }] : []),
            ];
        }

        const cacheKey = buildCacheKey("bookings", { page: pageNum, limit: limitNum, status, userId, storeId, serviceAreaId, sort_by: safeSortField, sort_order, from_date, to_date });

        if (!search) {
            const cached = await getCache(cacheKey);
            if (cached) return res.json({ success: true, message: "Bookings fetched successfully", data: cached });
        }

        const sort = { [safeSortField]: sort_order === "asc" ? 1 : -1 };
        const skip = (pageNum - 1) * limitNum;

        const [bookings, total] = await Promise.all([
            Booking.find(filter).select(EXCLUDED_FIELDS)
                .populate("userId", "first_name last_name phone email")
                .populate("storeId", "store_name store_contact_number")
                .sort(sort).skip(skip).limit(limitNum).lean(),
            Booking.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            bookings,
            pagination: { currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 },
        };

        if (!search) await setCache(cacheKey, responseData, LIST_CACHE_TTL);
        return res.json({ success: true, message: "Bookings fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getBookings] Error:", err);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to fetch bookings" });
    }
};

// GET BOOKING BY ID
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = bookingCacheKey(id);

        const cached = await getCache(cacheKey);
        if (cached) return res.json({ success: true, message: "Booking fetched successfully", data: cached });

        const booking = await Booking.findById(id).select(EXCLUDED_FIELDS)
            .populate("userId", "first_name last_name phone email")
            .populate("storeId", "store_name store_contact_number")
            .lean();

        if (!booking) return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Booking not found" });

        await setCache(cacheKey, booking, DETAIL_CACHE_TTL);
        return res.json({ success: true, message: "Booking fetched successfully", data: booking });
    } catch (err) {
        logger.error("[getBookingById] Error:", err);
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to fetch booking" });
    }
};

// CANCEL BOOKING
export const cancelBooking = (req, res) => withSession(res, "cancelBooking", async (session) => {
    const { id } = req.params;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id)
        .select("status userId storeId pickup.assignment.driverId delivery.assignment.driverId")
        .session(session).lean();

    if (!booking) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Booking not found" });
    }
    if (booking.status === BOOKING_STATUS.CANCELLED) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Booking is already cancelled" });
    }
    if (booking.status === BOOKING_STATUS.DELIVERED) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Cannot cancel a booking with status: ${booking.status}` });
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { status: BOOKING_STATUS.CANCELLED, updated_at: new Date(), status_updated_by: auth_id, cancellation_reason: "Admin requested cancellation", cancelled_at: new Date(), cancelled_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.CANCELLED, "Booking cancelled by admin", auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await releaseStoreCapacity(booking.storeId, session);
    await session.commitTransaction();
    session.endSession();

    await invalidateBookingCache(id, booking.userId);
    await tryEmit(BOOKING_STATUS.CANCELLED, id, booking, {
        driverId: booking.pickup?.assignment?.driverId || booking.delivery?.assignment?.driverId || null,
        reason: "Admin requested cancellation",
    });

    return res.json({ success: true, message: "Booking cancelled successfully", data: updatedBooking });
});

// ASSIGN / REASSIGN DRIVER
const assignDriverHandler = (isReassign) => (req, res) => withSession(res, isReassign ? "reassignDriver" : "assignDriver", async (session) => {
    const { id } = req.params;
    const { driverId } = req.body;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id).select("status userId pickup.assignment").session(session).lean();
    if (!booking) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Booking not found" });
    }

    const expectedStatus = isReassign ? BOOKING_STATUS.DRIVER_ASSIGNED : BOOKING_STATUS.STORE_ASSIGNED;
    if (booking.status !== expectedStatus) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Invalid status for this operation. Current: ${booking.status}` });
    }

    if (isReassign && booking.pickup?.assignment?.driverId?.toString() === driverId) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "This driver is already assigned to the booking" });
    }

    const driver = await fetchAvailableDriver(driverId, session);
    if (!driver) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Driver not available" });
    }

    const currentDriverId = booking.pickup?.assignment?.driverId;
    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { status: BOOKING_STATUS.DRIVER_ASSIGNED, "pickup.assignment.driverId": driverId, "pickup.assignment.assignedAt": new Date(), updated_at: new Date(), status_updated_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.DRIVER_ASSIGNED, isReassign ? `Driver reassigned by admin from ${currentDriverId} to ${driverId}` : `Driver manually assigned by admin: ${driver.name}`, auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await session.commitTransaction();
    session.endSession();

    await invalidateBookingCache(id, booking.userId);
    await tryEmit(BOOKING_STATUS.DRIVER_ASSIGNED, id, booking, { driver });

    return res.json({ success: true, message: isReassign ? "Driver reassigned successfully" : "Driver assigned successfully", data: updatedBooking });
});

export const assignDriver = assignDriverHandler(false);
export const reassignDriver = assignDriverHandler(true);

// REASSIGN STORE
export const reassignStore = (req, res) => withSession(res, "reassignStore", async (session) => {
    const { id } = req.params;
    const { storeId } = req.body;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id).select("status userId storeId").session(session).lean();
    if (!booking) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Booking not found" });
    }

    const reassignableStatuses = [BOOKING_STATUS.CREATED, BOOKING_STATUS.STORE_ASSIGNED];
    if (!reassignableStatuses.includes(booking.status)) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Store can only be reassigned before driver assignment. Current: ${booking.status}` });
    }
    if (booking.storeId?.toString() === storeId) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Store is already assigned to this booking" });
    }

    await releaseStoreCapacity(booking.storeId, session);

    const { success: storeAssigned } = await assignStoreToBooking(storeId, session);
    if (!storeAssigned) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.CONFLICT).json({ success: false, message: "Selected store is at capacity" });
    }

    const store = await Store.findById(storeId).select("store_name address location").session(session).lean();
    if (!store) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Store not found" });
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { storeId, status: BOOKING_STATUS.STORE_ASSIGNED, updated_at: new Date(), status_updated_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.STORE_ASSIGNED, `Store reassigned by admin: ${store.store_name}`, auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await session.commitTransaction();
    session.endSession();

    await invalidateBookingCache(id, booking.userId);
    await tryEmit(BOOKING_STATUS.STORE_ASSIGNED, id, booking, { store: { ...store, name: store.store_name } });

    return res.json({ success: true, message: "Store reassigned successfully", data: updatedBooking });
});

// ASSIGN RETURN DRIVER
export const assignReturnDriver = (req, res) => withSession(res, "assignReturnDriver", async (session) => {
    const { id } = req.params;
    const { driverId } = req.body;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id).select("status userId").session(session).lean();
    if (!booking) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Booking not found" });
    }
    if (!isValidStatusTransition(booking.status, BOOKING_STATUS.RETURN_DRIVER_ASSIGNED)) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Return driver can only be assigned after return is requested. Current: ${booking.status}` });
    }

    const driver = await fetchAvailableDriver(driverId, session);
    if (!driver) {
        await safeAbortSession(session);
        return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Driver not available" });
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED, "delivery.assignment.driverId": driverId, "delivery.assignment.assignedAt": new Date(), updated_at: new Date(), status_updated_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.RETURN_DRIVER_ASSIGNED, `Return driver assigned by admin: ${driver.name}`, auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await session.commitTransaction();
    session.endSession();

    await invalidateBookingCache(id, booking.userId);
    await tryEmit(BOOKING_STATUS.RETURN_DRIVER_ASSIGNED, id, booking, { driver });

    return res.json({ success: true, message: "Return driver assigned successfully", data: updatedBooking });
});

// STATUS PROGRESSION FACTORY
const createStatusProgressController = ({ toStatus, successMessage, timelineMessage, controllerName }) =>
    (req, res) => withSession(res, controllerName, async (session) => {
        const { id } = req.params;
        const { auth_id } = req.user;

        const booking = await Booking.findById(id).select("status userId").session(session).lean();
        if (!booking) {
            await safeAbortSession(session);
            return res.status(STATUS_CODES.NOT_FOUND).json({ success: false, message: "Booking not found" });
        }
        if (!isValidStatusTransition(booking.status, toStatus)) {
            await safeAbortSession(session);
            return res.status(STATUS_CODES.BAD_REQUEST).json({ success: false, message: `Cannot transition to ${toStatus} from: ${booking.status}` });
        }

        const updatedBooking = await Booking.findByIdAndUpdate(id, {
            $set: { status: toStatus, updated_at: new Date(), status_updated_by: auth_id },
            $push: { timeline: createTimelineEntry(toStatus, timelineMessage, auth_id) },
        }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

        await session.commitTransaction();
        session.endSession();

        await invalidateBookingCache(id, booking.userId);
        await tryEmit(toStatus, id, booking);

        return res.json({ success: true, message: successMessage, data: updatedBooking });
    });

export const markDriverArrived = createStatusProgressController({ toStatus: BOOKING_STATUS.DRIVER_ARRIVED, successMessage: "Driver marked as arrived", timelineMessage: "Driver arrived at pickup location (admin)", controllerName: "markDriverArrived" });
export const markPickedUp = createStatusProgressController({ toStatus: BOOKING_STATUS.PICKED_UP, successMessage: "Booking marked as picked up", timelineMessage: "Luggage picked up by driver (admin)", controllerName: "markPickedUp" });
export const markStored = createStatusProgressController({ toStatus: BOOKING_STATUS.STORED, successMessage: "Booking marked as stored", timelineMessage: "Luggage stored at facility (admin)", controllerName: "markStored" });
export const requestReturn = createStatusProgressController({ toStatus: BOOKING_STATUS.RETURN_REQUESTED, successMessage: "Return requested successfully", timelineMessage: "Return requested by admin", controllerName: "requestReturn" });
export const markDelivered = createStatusProgressController({ toStatus: BOOKING_STATUS.DELIVERED, successMessage: "Booking marked as delivered", timelineMessage: "Luggage delivered to customer (admin)", controllerName: "markDelivered" });