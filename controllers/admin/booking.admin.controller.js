import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import User from "../../models/User.js";
import mongoose from "mongoose";
import { assignStoreToBooking, releaseDriver, isValidStatusTransition } from "../../helpers/user/bookingHelper.js";
import logger from "../../utils/logger.js";
import { getIO } from "../../src/socket/index.js";
import { STATUS_CODES, BOOKING_STATUS, ACCOUNT_STATUS } from "../../utils/constants.js";
import {
    emitBookingCancelled, emitBookingDriverAssigned, emitBookingStoreAssigned,
    emitBookingReturnDriverAssigned, emitBookingDriverArrived, emitBookingPickedUp,
    emitBookingStored, emitBookingReturnRequested, emitBookingDelivered,
} from "../../src/socket/emitters/booking.emitter.js";
import { cacheAside, deleteByPattern, deleteCache } from "../../constants/redis/redisOperation.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { invalidateBookingCache } from "../../constants/redis/invalidate/booking.invalidate.js";

const EXCLUDED_FIELDS = "-__v";
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createTimelineEntry = (status, note, actorId, role = "Admin") => ({
    status, note, updatedBy: actorId, role, timestamp: new Date(),
});

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
        return sendError(res, "Failed to update booking status");
    }
};

// still used by assignReturnDriver — NOT used by assignDriver anymore (replaced with an atomic claim there)
const fetchAvailableDriver = async (driverId, session) => {
    const driver = await Driver.findById(driverId)
        .select("account_status is_online is_on_trip first_name last_name phone vehicle_details")
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

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = AdminKeys.bookingList({
            page: pageNum, limit: limitNum, status, userId, storeId, serviceAreaId,
            search, sort_by, sort_order, from_date, to_date,
        });

        const responseData = await cacheAside(cacheKey, AdminTTL.BOOKING_LIST, async () => {
            const filter = {
                ...(status && { status }),
                ...(storeId && { storeId }),
                ...(serviceAreaId && { serviceAreaId }),
                ...(userId && { userId }),
            };

            if (from_date || to_date) {
                let toDateEnd;
                if (to_date) {
                    toDateEnd = new Date(to_date);
                    toDateEnd.setHours(23, 59, 59, 999); // FIXED — actually mutates the date now, not a bolted-on unused property
                }
                filter.createdAt = {
                    ...(from_date && { $gte: new Date(from_date) }),
                    ...(to_date && { $lte: toDateEnd }),
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

            const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
            const skip = (pageNum - 1) * limitNum;

            const [bookings, total] = await Promise.all([
                Booking.find(filter).select(EXCLUDED_FIELDS)
                    .populate("userId", "first_name last_name phone email")
                    .populate("storeId", "store_name store_contact_number")
                    .sort(sort).skip(skip).limit(limitNum).lean(),
                Booking.countDocuments(filter),
            ]);

            const totalPages = Math.ceil(total / limitNum);
            return {
                bookings,
                pagination: { currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum, hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 },
            };
        });
        return sendResponse({ res, message: "Bookings fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getBookings] Error:", err);
        return sendError(res, "Failed to fetch bookings");
    }
};

// GET BOOKING BY ID
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await cacheAside(
            AdminKeys.bookingDetail(id),
            AdminTTL.BOOKING_DETAIL,
            () => Booking.findById(id).select(EXCLUDED_FIELDS)
                .populate("userId", "first_name last_name phone email")
                .populate("storeId", "store_name store_contact_number")
                .lean()
        );
        if (!booking) return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        return sendResponse({ res, message: "Booking fetched successfully", data: booking });
    } catch (err) {
        logger.error("[getBookingById] Error:", err.message);
        return sendError(res, "Failed to fetch booking");
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
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }
    if (booking.status === BOOKING_STATUS.CANCELLED) {
        await safeAbortSession(session);
        return sendError(res, "Booking is already cancelled", STATUS_CODES.BAD_REQUEST);
    }
    if (booking.status === BOOKING_STATUS.DELIVERED) {
        await safeAbortSession(session);
        return sendError(res, `Cannot cancel a booking with status: ${booking.status}`, STATUS_CODES.BAD_REQUEST);
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { status: BOOKING_STATUS.CANCELLED, updated_at: new Date(), status_updated_by: auth_id, cancellation_reason: "Admin requested cancellation", cancelled_at: new Date(), cancelled_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.CANCELLED, "Booking cancelled by admin", auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await releaseStoreCapacity(booking.storeId, session);
    await session.commitTransaction();
    session.endSession();

    const driverId = booking.pickup?.assignment?.driverId || booking.delivery?.assignment?.driverId;
    if (driverId) {
        await releaseDriver(driverId).catch((err) =>
            logger.warn("[cancelBooking] Failed to release driver:", err.message)
        );
    }

    await invalidateBookingCache(booking, { driverIds: [driverId], storeId: booking.storeId });

    await tryEmit(BOOKING_STATUS.CANCELLED, id, booking, {
        driverId: driverId || null,
        reason: "Admin requested cancellation",
    });

    return sendResponse({ res, message: "Booking cancelled successfully", data: updatedBooking });
});

// ASSIGN / REASSIGN DRIVER
export const assignDriver = (req, res) => withSession(res, "assignDriver", async (session) => {
    const { id } = req.params;
    const { driverId } = req.body;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id).select("status userId storeId pickup.assignment").session(session).lean();
    if (!booking) {
        await safeAbortSession(session);
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }

    const isReassign = booking.status === BOOKING_STATUS.DRIVER_ASSIGNED;
    if (![BOOKING_STATUS.STORE_ASSIGNED, BOOKING_STATUS.DRIVER_ASSIGNED].includes(booking.status)) {
        await safeAbortSession(session);
        return sendError(res, `Invalid status for this operation. Current: ${booking.status}`, STATUS_CODES.CONFLICT);
    }

    const currentDriverId = booking.pickup?.assignment?.driverId?.toString();
    if (isReassign && currentDriverId === driverId) {
        await safeAbortSession(session);
        return sendError(res, "This driver is already assigned to the booking", STATUS_CODES.BAD_REQUEST);
    }

    // atomic claim — matches the SAME fields fetchAvailableDriver checks, fixes the typo'd field name
    const claimedDriver = await Driver.findOneAndUpdate(
        { _id: driverId, account_status: ACCOUNT_STATUS.ACTIVE, is_online: true, is_on_trip: false },
        { $set: { is_on_trip: true } },
        { new: true, session }
    ).select("_id first_name last_name phone vehicle_details").lean();

    if (!claimedDriver) {
        await safeAbortSession(session);
        return sendError(res, "Driver not available", STATUS_CODES.BAD_REQUEST);
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
        id,
        {
            $set: {
                status: BOOKING_STATUS.DRIVER_ASSIGNED,
                "pickup.assignment.driverId": driverId,
                "pickup.assignment.assignedAt": new Date(),
                updated_at: new Date(),
                status_updated_by: auth_id,
            },
            $push: {
                timeline: createTimelineEntry(
                    BOOKING_STATUS.DRIVER_ASSIGNED,
                    isReassign
                        ? `Driver reassigned by admin from ${currentDriverId} to ${driverId}`
                        : `Driver manually assigned by admin: ${claimedDriver.first_name}`,
                    auth_id
                ),
            },
        },
        { new: true, runValidators: true, session }
    ).select(EXCLUDED_FIELDS).lean();

    if (isReassign && currentDriverId) {
        await Driver.findByIdAndUpdate(currentDriverId, { $set: { is_on_trip: false } }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    await invalidateBookingCache(booking, {
        driverIds: [driverId, isReassign ? currentDriverId : null],
        storeId: booking.storeId,
    });

    await tryEmit(BOOKING_STATUS.DRIVER_ASSIGNED, id, booking, { driver: claimedDriver });

    return sendResponse({
        res,
        message: isReassign ? "Driver reassigned successfully" : "Driver assigned successfully",
        data: updatedBooking,
    });
});

// REASSIGN STORE
export const reassignStore = (req, res) => withSession(res, "reassignStore", async (session) => {
    const { id } = req.params;
    const { storeId } = req.body;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id).select("status userId storeId").session(session).lean();
    if (!booking) {
        await safeAbortSession(session);
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }

    const reassignableStatuses = [BOOKING_STATUS.CREATED, BOOKING_STATUS.STORE_ASSIGNED];
    if (!reassignableStatuses.includes(booking.status)) {
        await safeAbortSession(session);
        return sendError(res, `Store can only be reassigned before driver assignment. Current: ${booking.status}`, STATUS_CODES.BAD_REQUEST);
    }
    if (booking.storeId?.toString() === storeId) {
        await safeAbortSession(session);
        return sendError(res, "Store is already assigned to this booking", STATUS_CODES.BAD_REQUEST);
    }

    const oldStoreId = booking.storeId;
    await releaseStoreCapacity(oldStoreId, session);

    const { success: storeAssigned } = await assignStoreToBooking(storeId, session);
    if (!storeAssigned) {
        await safeAbortSession(session);
        return sendError(res, "Selected store is at capacity", STATUS_CODES.CONFLICT);
    }

    const store = await Store.findById(storeId).select("store_name address location").session(session).lean();
    if (!store) {
        await safeAbortSession(session);
        return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { storeId, status: BOOKING_STATUS.STORE_ASSIGNED, updated_at: new Date(), status_updated_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.STORE_ASSIGNED, `Store reassigned by admin: ${store.store_name}`, auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await session.commitTransaction();
    session.endSession();

    // bust BOTH the old and new store's caches — old store no longer has this booking, new one does
    await invalidateBookingCache(booking, { storeId: oldStoreId });
    await invalidateBookingCache(booking, { storeId });

    await tryEmit(BOOKING_STATUS.STORE_ASSIGNED, id, booking, { store: { ...store, name: store.store_name } });

    return sendResponse({ res, message: "Store reassigned successfully", data: updatedBooking });
});

// ASSIGN RETURN DRIVER
export const assignReturnDriver = (req, res) => withSession(res, "assignReturnDriver", async (session) => {
    const { id } = req.params;
    const { driverId } = req.body;
    const { auth_id } = req.user;

    const booking = await Booking.findById(id).select("status userId storeId").session(session).lean();
    if (!booking) {
        await safeAbortSession(session);
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }
    if (!isValidStatusTransition(booking.status, BOOKING_STATUS.RETURN_DRIVER_ASSIGNED)) {
        await safeAbortSession(session);
        return sendError(res, `Return driver can only be assigned after return is requested. Current: ${booking.status}`, STATUS_CODES.BAD_REQUEST);
    }

    // same race condition as assignDriver had — use the atomic claim here too, not the read-only check
    const claimedDriver = await Driver.findOneAndUpdate(
        { _id: driverId, account_status: ACCOUNT_STATUS.ACTIVE, is_online: true, is_on_trip: false },
        { $set: { is_on_trip: true } },
        { new: true, session }
    ).select("_id first_name last_name phone vehicle_details").lean();

    if (!claimedDriver) {
        await safeAbortSession(session);
        return sendError(res, "Driver not available", STATUS_CODES.BAD_REQUEST);
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, {
        $set: { status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED, "delivery.assignment.driverId": driverId, "delivery.assignment.assignedAt": new Date(), updated_at: new Date(), status_updated_by: auth_id },
        $push: { timeline: createTimelineEntry(BOOKING_STATUS.RETURN_DRIVER_ASSIGNED, `Return driver assigned by admin: ${claimedDriver.first_name}`, auth_id) },
    }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

    await session.commitTransaction();
    session.endSession();

    await invalidateBookingCache(booking, { driverIds: [driverId], storeId: booking.storeId });
    await tryEmit(BOOKING_STATUS.RETURN_DRIVER_ASSIGNED, id, booking, { driver: claimedDriver });

    return sendResponse({ res, message: "Return driver assigned successfully", data: updatedBooking });
});

// STATUS PROGRESSION FACTORY
const createStatusProgressController = ({ toStatus, successMessage, timelineMessage, controllerName }) =>
    (req, res) => withSession(res, controllerName, async (session) => {
        const { id } = req.params;
        const { auth_id } = req.user;

        const booking = await Booking.findById(id)
            .select("status userId storeId pickup.assignment.driverId delivery.assignment.driverId")
            .session(session).lean();
        if (!booking) {
            await safeAbortSession(session);
            return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
        }
        if (!isValidStatusTransition(booking.status, toStatus)) {
            await safeAbortSession(session);
            return sendError(res, `Cannot transition to ${toStatus} from: ${booking.status}`, STATUS_CODES.BAD_REQUEST);
        }

        const updatedBooking = await Booking.findByIdAndUpdate(id, {
            $set: { status: toStatus, updated_at: new Date(), status_updated_by: auth_id },
            $push: { timeline: createTimelineEntry(toStatus, timelineMessage, auth_id) },
        }, { new: true, runValidators: true, session }).select(EXCLUDED_FIELDS).lean();

        await session.commitTransaction();
        session.endSession();

        let releasedDriverId = null;
        if (toStatus === BOOKING_STATUS.STORED) {
            releasedDriverId = booking.pickup?.assignment?.driverId;
        } else if (toStatus === BOOKING_STATUS.DELIVERED) {
            releasedDriverId = booking.delivery?.assignment?.driverId;
        }
        if (releasedDriverId) {
            await releaseDriver(releasedDriverId).catch((err) =>
                logger.warn(`[${controllerName}] Failed to release driver:`, err.message)
            );
        }

        await invalidateBookingCache(booking, {
            driverIds: [booking.pickup?.assignment?.driverId, booking.delivery?.assignment?.driverId],
            storeId: booking.storeId,
        });
        await tryEmit(toStatus, id, booking);

        return sendResponse({ res, message: successMessage, data: updatedBooking });
    });

export const markDriverArrived = createStatusProgressController({ toStatus: BOOKING_STATUS.DRIVER_ARRIVED, successMessage: "Driver marked as arrived", timelineMessage: "Driver arrived at pickup location (admin)", controllerName: "markDriverArrived" });
export const markPickedUp = createStatusProgressController({ toStatus: BOOKING_STATUS.PICKED_UP, successMessage: "Booking marked as picked up", timelineMessage: "Luggage picked up by driver (admin)", controllerName: "markPickedUp" });
export const markStored = createStatusProgressController({ toStatus: BOOKING_STATUS.STORED, successMessage: "Booking marked as stored", timelineMessage: "Luggage stored at facility (admin)", controllerName: "markStored" });
export const requestReturn = createStatusProgressController({ toStatus: BOOKING_STATUS.RETURN_REQUESTED, successMessage: "Return requested successfully", timelineMessage: "Return requested by admin", controllerName: "requestReturn" });
export const markDelivered = createStatusProgressController({ toStatus: BOOKING_STATUS.DELIVERED, successMessage: "Booking marked as delivered", timelineMessage: "Luggage delivered to customer (admin)", controllerName: "markDelivered" });