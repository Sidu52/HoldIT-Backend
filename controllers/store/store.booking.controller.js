import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import { timingSafeEqual } from "../../helpers/user/authHelper.js";
import { incrementStoreCapacity, decrementStoreCapacity } from "../../services/storeServices.js";
import { markDriverAvailable, addDriverToRedis } from "../../services/driverGeoService.js";
import { getIO } from "../../src/socket/index.js";
import {
    emitBookingStored,
    emitBookingOutForReturn
} from "../../src/socket/emitters/booking.emitter.js";
import logger from "../../utils/logger.js";
import { processMarkStored } from "../../helpers/store/store.helper.js";
import { invalidateBookingCache } from "../../constants/redis/invalidate/booking.invalidate.js";
import { invalidateStoreBookingCache } from "../../constants/redis/invalidate/store.invalidate.js";
import { cacheAside } from "../../constants/redis/redisOperation.js";
import { StoreKeys, StoreTTL } from "../../constants/redis/store.keys.js";

const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};

const STORE_BOOKING_FIELDS = [
  "bookingCode", "status", "userId", "userInfo",
  "luggage", "luggagePhotos",
  "storage", "deliveryLocation", "pickup.scheduledAt",
  "pickup.assignment.completedAt",
  "pickup.assignment.storageOtp",
  "pickup.assignment.driverId",
  "pickup.assignment.assignedAt",
  "pickup.assignment.startedAt",
  "pickup.assignment.completedAt",
  
  "delivery.requestedAt",
  "delivery.assignment.driverId",
  "delivery.assignment.assignedAt",
  "delivery.assignment.startedAt",
  "delivery.assignment.completedAt",
  "delivery.assignment.returnOtp",
  "delivery.assignment.storageReturnOtp",
  "delivery.assignment.completedAt",
  "cancelReason",
  "cancelledAt",
];

const buildPagination = (page, limit, total) => ({
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
});

// GET INCOMING
export const getIncomingBookings = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const cacheKey = StoreKeys.bookingIncoming(storeId);

        const data = await cacheAside(cacheKey, StoreTTL.BOOKING_INCOMING, async () => {
            const bookings = await Booking.find({
                storeId: new mongoose.Types.ObjectId(storeId),
                status: {
                    $in: [
                        BOOKING_STATUS.STORE_ASSIGNED,
                        BOOKING_STATUS.DRIVER_ASSIGNED,
                        BOOKING_STATUS.DRIVER_ARRIVED,
                        BOOKING_STATUS.PICKED_UP,
                        BOOKING_STATUS.AT_STORE
                    ]
                },
                isActive: true,
            })
                .select(STORE_BOOKING_FIELDS.join(" "))
                .populate("userId", "first_name last_name phone")
                .populate("pickup.assignment.driverId", "first_name last_name phone")
                .populate("delivery.assignment.driverId", "first_name last_name phone")
                .sort({ createdAt: 1 })
                .lean();

            return { bookings, total: bookings.length };
        });

        return sendResponse({
            res,
            message: "Incoming bookings fetched successfully.",
            data,
        });
    } catch (err) {
        logger.error("Store Get Incoming Error:", err);
        return sendError(res, "Failed to fetch incoming bookings.");
    }
};

// GET ACTIVE
export const getActiveBookings = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(50, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * limitNum;

        const cacheKey = StoreKeys.bookingActive(storeId, { page: pageNum, limit: limitNum });

        const data = await cacheAside(cacheKey, StoreTTL.BOOKING_ACTIVE, async () => {
            const filter = {
                storeId: new mongoose.Types.ObjectId(storeId),
                status: {
                    $in: [
                        BOOKING_STATUS.STORED,
                        BOOKING_STATUS.RETURN_REQUESTED,
                    ]
                },
                isActive: true,
            };

            const [bookings, total] = await Promise.all([
                Booking.find(filter)
                    .select(STORE_BOOKING_FIELDS.join(" "))
                    .populate("userId", "first_name last_name phone")
                    .populate("pickup.assignment.driverId", "first_name last_name phone")
                    .populate("delivery.assignment.driverId", "first_name last_name phone")
                    .sort({ "storage.storedAt": -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                Booking.countDocuments(filter),
            ]);

            return {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            };
        });

        return sendResponse({
            res,
            message: "Active bookings fetched successfully.",
            data,
        });
    } catch (err) {
        logger.error("Store Get Active Error:", err);
        return sendError(res, "Failed to fetch active bookings.");
    }
};

// GET RETURN PARCEL
export const getReturnParcels = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(50, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * limitNum;

        const cacheKey = StoreKeys.bookingReturnParcel(storeId, { page: pageNum, limit: limitNum });

        const data = await cacheAside(cacheKey, StoreTTL.BOOKING_RETURN_PARCEL, async () => {
            const filter = {
                storeId: new mongoose.Types.ObjectId(storeId),
                status: {
                    $in: [
                        BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                    ]
                },
                isActive: true,
            };

            const [bookings, total] = await Promise.all([
                Booking.find(filter)
                    .select(STORE_BOOKING_FIELDS.join(" "))
                    .populate("userId", "first_name last_name phone")
                    .populate("pickup.assignment.driverId", "first_name last_name phone")
                    .populate("delivery.assignment.driverId", "first_name last_name phone")
                    .sort({ createdAt: 1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                Booking.countDocuments(filter),
            ]);

            return {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            };
        });

        return sendResponse({
            res,
            message: "Return parcel fetched successfully.",
            data,
        }); 
    } catch (err) {
        logger.error("Store Get Return Parcel Error:", err);
        return sendError(res, "Failed to fetch return parcel.");
    }
}

// GET BOOKING DETAIL
export const getBookingDetail = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const cacheKey = StoreKeys.bookingDetail(storeId, booking_id);

        const booking = await cacheAside(cacheKey, StoreTTL.BOOKING_DETAIL, async () => {
            return Booking.findOne({
                _id: booking_id,
                storeId: new mongoose.Types.ObjectId(storeId),
            })
                .select(STORE_BOOKING_FIELDS.join(" "))
                .populate("userId", "first_name last_name phone")
                .populate("pickup.assignment.driverId", "first_name last_name phone")
                .populate("delivery.assignment.driverId", "first_name last_name phone")
                .populate("storeId", "store_name store_contact_number location")
                .lean();
        });

        if (!booking) {
            return sendError(res, "Booking not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Booking fetched successfully.",
            data: { booking },
        });
    } catch (err) {
        logger.error("Store Get Booking Detail Error:", err);
        return sendError(res, "Failed to fetch booking.");
    }
};

// CONFIRM STORED
export const confirmStored = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;
        const { notes = "", otp } = req.body || {};

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
        })
            .select("status userId storage pickup.assignment")
            .lean();

        if (!booking) {
            return sendError(res, "Booking not found.", STATUS_CODES.NOT_FOUND);
        }

        if (booking.status !== BOOKING_STATUS.AT_STORE) {
            return sendError(
                res,
                `Cannot confirm storage — booking is currently "${booking.status}". Driver must arrive at store first.`,
                STATUS_CODES.CONFLICT
            );
        }

        if (!otp) {
            return sendError(res, "OTP is required.", STATUS_CODES.BAD_REQUEST);
        }

        const storageOtp = booking.pickup?.assignment?.storageOtp;

        const isValid =
            storageOtp &&
            storageOtp.length === otp.toString().length &&
            timingSafeEqual(storageOtp, otp.toString());

        if (!isValid) {
            return sendError(res, "Invalid or expired OTP.", STATUS_CODES.BAD_REQUEST);
        }

        const updated = await processMarkStored(booking_id, storeId, notes);

        if (!updated) {
            return sendError(res, "Booking is no longer eligible for this action.", STATUS_CODES.CONFLICT);
        }

        const userId = updated.userId.toString();

        await incrementStoreCapacity(storeId);

        // Clear both user-facing and store-facing caches
        await Promise.allSettled([
            invalidateBookingCache(userId, booking_id),
            invalidateStoreBookingCache(storeId, booking_id),
        ]);

        try {
            const io = safeGetIO();
            if (io) {
                emitBookingStored(io, booking_id, userId, updated.storage?.storedAt, "Your Store");
            }
        } catch (socketErr) {
            logger.debug(`[Store:Socket] Socket emission skipped: ${socketErr.message}`);
        }

        await Promise.allSettled([
            invalidateBookingCache(userId, booking_id),
            invalidateStoreBookingCache(storeId, booking_id),
        ]);

        return sendResponse({
            res,
            message: "Luggage confirmed as stored successfully.",
            data: {
                bookingId: updated._id,
                bookingCode: updated.bookingCode,
                status: updated.status,
                storedAt: updated.storage?.storedAt,
            },
        });
    } catch (err) {
        logger.error("Store Confirm Stored Error:", err);
        return sendError(res, "Failed to confirm storage.");
    }
};

// GET HISTORY
export const getBookingHistory = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { page = 1, limit = 20, sort_order = "desc" } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(50, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        const cacheKey = StoreKeys.bookingHistory(storeId, { page: pageNum, limit: limitNum, sort_order });

        const data = await cacheAside(cacheKey, StoreTTL.BOOKING_HISTORY, async () => {
            const filter = {
                storeId: new mongoose.Types.ObjectId(storeId),
                status: { $in: [BOOKING_STATUS.DELIVERED, BOOKING_STATUS.CANCELLED] },
            };

            const [bookings, total] = await Promise.all([
                Booking.find(filter)
                    .select(STORE_BOOKING_FIELDS.join(" "))
                    .populate("userId", "first_name last_name phone")
                    .populate("pickup.assignment.driverId", "first_name last_name phone")
                    .populate("delivery.assignment.driverId", "first_name last_name phone")
                    .sort({ createdAt: sortDir })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                Booking.countDocuments(filter),
            ]);

            return {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            };
        });

        return sendResponse({
            res,
            message: "Booking history fetched successfully.",
            data,
        });
    } catch (err) {
        logger.error("Store Get History Error:", err);
        return sendError(res, "Failed to fetch booking history.");
    }
};

// DASHBOARD (cached)
export const getDashboard = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const cacheKey = StoreKeys.dashboard(storeId);

        const data = await cacheAside(cacheKey, StoreTTL.DASHBOARD, async () => {
            const [store, counts] = await Promise.all([
                Store.findById(storeId)
                    .select("store_name is_online current_booking_count max_booking_capacity rating")
                    .lean(),
                Booking.aggregate([
                    { $match: { storeId: new mongoose.Types.ObjectId(storeId) } },
                    { $group: { _id: "$status", count: { $sum: 1 } } },
                ]),
            ]);

            if (!store) return null;

            const statusCounts = counts.reduce((acc, { _id, count }) => {
                acc[_id] = count;
                return acc;
            }, {});

            return {
                store,
                stats: {
                    incoming: (statusCounts[BOOKING_STATUS.STORE_ASSIGNED] || 0) +
                        (statusCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) +
                        (statusCounts[BOOKING_STATUS.DRIVER_ARRIVED] || 0) +
                        (statusCounts[BOOKING_STATUS.PICKED_UP] || 0) +
                        (statusCounts[BOOKING_STATUS.AT_STORE] || 0),
                    stored: (statusCounts[BOOKING_STATUS.STORED] || 0),
                    returned: (statusCounts[BOOKING_STATUS.RETURN_REQUESTED] || 0) +
                        (statusCounts[BOOKING_STATUS.RETURN_DRIVER_ASSIGNED] || 0),
                    delivered: statusCounts[BOOKING_STATUS.DELIVERED] || 0,
                    cancelled: (statusCounts[BOOKING_STATUS.CANCELLED] || 0) +
                        (statusCounts[BOOKING_STATUS.DRIVER_CANCELLED_CRITICAL] || 0),
                    capacityUsed: store.current_booking_count,
                    capacityAvailable: Math.max(0, store.max_booking_capacity - store.current_booking_count),
                },
            };
        });

        if (!data) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Dashboard fetched successfully.",
            data,
        });
    } catch (err) {
        logger.error("Store Dashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};

// VERIFY RETURN OTP
export const verifyReturnOtp = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;
        const { otp } = req.body || {};

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        if (!otp) {
            return sendError(res, "OTP is required.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
            status: BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
        })
            .select("delivery userId")
            .lean();

        if (!booking) {
            return sendError(res, "Booking not found or not ready for return handover.", STATUS_CODES.NOT_FOUND);
        }

        const returnOtp = booking.delivery?.assignment?.returnOtp;

        const isValid =
            returnOtp &&
            returnOtp.length === otp.toString().length &&
            timingSafeEqual(returnOtp, otp.toString());

        if (!isValid) {
            return sendError(res, "Invalid or expired OTP.", STATUS_CODES.BAD_REQUEST);
        }

        const now = new Date();

        const updated = await Booking.findByIdAndUpdate(
            booking_id,
            {
                $set: {
                    status: BOOKING_STATUS.OUT_FOR_RETURN,
                    "storage.releasedAt": now,
                    "delivery.assignment.returnOtp": null,
                    lastStatusUpdatedAt: now,
                },
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.OUT_FOR_RETURN,
                        note: "Luggage handed over to return driver by store",
                        updatedBy: new mongoose.Types.ObjectId(storeId),
                        updatedByModel: "Store",
                        createdAt: now,
                    },
                },
            },
            { new: true }
        ).select("_id userId storage delivery");

        const userId = updated.userId.toString();

        await decrementStoreCapacity(storeId);

        await Promise.allSettled([
            invalidateBookingCache(userId, booking_id),
            invalidateStoreBookingCache(storeId, booking_id),
        ]);

        try {
            const io = safeGetIO();
            if (io) {
                const driverId = updated.delivery?.assignment?.driverId?.toString();
                emitBookingOutForReturn(io, booking_id, userId, driverId, now);
            }
        } catch (socketErr) {
            logger.debug(`[Store:Socket] Socket emission skipped: ${socketErr.message}`);
        }

        return sendResponse({
            res,
            message: "Luggage handed over to return driver successfully.",
            data: {
                bookingId: updated._id,
                releasedAt: updated.storage?.releasedAt,
            },
        });
    } catch (err) {
        logger.error("Store Verify Return OTP Error:", err);
        return sendError(res, "Failed to verify return OTP.");
    }
};