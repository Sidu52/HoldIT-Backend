import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import { invalidateBookingCache } from "../../helpers/user/bookingHelper.js";
import { timingSafeEqual } from "../../helpers/user/authHelper.js";
import { incrementStoreCapacity, decrementStoreCapacity } from "../../services/storeServices.js";
import { markDriverAvailable, addDriverToRedis } from "../../services/driverGeoService.js";
import { getIO } from "../../src/socket/index.js";
import { 
    emitBookingStored, 
    emitBookingOutForReturn 
} from "../../src/socket/emitters/booking.emitter.js";
import logger from "../../utils/logger.js";

/** Safely get Socket.IO instance */
const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};


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
            .select("bookingCode status pickupLocation luggage pickup storage pricing userId createdAt")
            .populate("userId", "first_name last_name phone")
            .sort({ createdAt: 1 })
            .lean();

        return sendResponse({
            res,
            message: "Incoming bookings fetched successfully.",
            data: { bookings, total: bookings.length },
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

        const filter = {
            storeId: new mongoose.Types.ObjectId(storeId),
            status: { 
                $in: [
                    BOOKING_STATUS.STORED, 
                    BOOKING_STATUS.RETURN_REQUESTED, 
                    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED
                ] 
            },
            isActive: true,
        };

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select("bookingCode status pickupLocation luggage storage pricing payment userId createdAt")
                .populate("userId", "first_name last_name phone")
                .sort({ "storage.storedAt": -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        return sendResponse({
            res,
            message: "Active bookings fetched successfully.",
            data: {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            },
        });
    } catch (err) {
        logger.error("Store Get Active Error:", err);
        return sendError(res, "Failed to fetch active bookings.");
    }
};

// GET BOOKING DETAIL
export const getBookingDetail = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { booking_id } = req.params;

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
        })
            .select("-__v")
            .populate("userId", "first_name last_name phone")
            .populate("storeId", "store_name store_contact_number location")
            .lean();

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
        const { notes = "" } = req.body || {};

        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const booking = await Booking.findOne({
            _id: booking_id,
            storeId: new mongoose.Types.ObjectId(storeId),
        })
            .select("status userId storage pickup.assignment.driverId")
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

        const now = new Date();

        const updated = await Booking.findByIdAndUpdate(
            booking_id,
            {
                $set: {
                    status: BOOKING_STATUS.STORED,
                    "storage.storedAt": now,
                    "storage.notes": notes,
                    lastStatusUpdatedAt: now,
                },
                $push: {
                    timeline: {
                        status: BOOKING_STATUS.STORED,
                        note: notes || "Luggage confirmed as stored by store",
                        updatedBy: new mongoose.Types.ObjectId(storeId),
                        updatedByModel: "Store",
                        createdAt: now,
                    },
                },
            },
            { new: true }
        ).select("_id bookingCode status storage userId pickup");

        const userId = updated.userId.toString();
        const driverId = updated.pickup?.assignment?.driverId?.toString();
        
        // 1. Increment Store Capacity
        await incrementStoreCapacity(storeId);

        // 2. RELEASE DRIVER (If assigned)
        if (driverId) {
            try {
                const driver = await Driver.findById(driverId);
                if (driver) {
                    driver.is_on_trip = false;
                    driver.current_booking_id = null;
                    await driver.save();

                    // Re-sync to Redis (update Geo index and metadata)
                    await addDriverToRedis(driver);
                    await markDriverAvailable(driverId); 
                }
            } catch (err) {
                logger.error(`[ConfirmStored] Driver release/sync failed for ${driverId}:`, err);
            }
        }

        // 3. Clear cache
        await invalidateBookingCache(userId, booking_id).catch(() => { });

        // 4. Emit Socket Event
        try {
            const io = safeGetIO();
            if (io) {
                emitBookingStored(
                    io, 
                    booking_id, 
                    userId, 
                    updated.storage?.storedAt, 
                    "Your Store" // Could fetch actual name if needed
                );
            }
        } catch (socketErr) {
            logger.debug(`[Store:Socket] Socket emission skipped: ${socketErr.message}`);
        }

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

        const filter = {
            storeId: new mongoose.Types.ObjectId(storeId),
            status: { $in: [BOOKING_STATUS.DELIVERED, BOOKING_STATUS.CANCELLED] },
        };

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .select("bookingCode status pickupLocation luggage pricing payment storage createdAt cancelledAt cancelReason")
                .populate("userId", "first_name last_name phone")
                .sort({ createdAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Booking.countDocuments(filter),
        ]);

        return sendResponse({
            res,
            message: "Booking history fetched successfully.",
            data: {
                bookings,
                pagination: buildPagination(pageNum, limitNum, total),
            },
        });
    } catch (err) {
        logger.error("Store Get History Error:", err);
        return sendError(res, "Failed to fetch booking history.");
    }
};

// DASHBOARD
export const getDashboard = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const [store, counts] = await Promise.all([
            Store.findById(storeId)
                .select("store_name is_online current_booking_count max_booking_capacity rating")
                .lean(),
            Booking.aggregate([
                {
                    $match: {
                        storeId: new mongoose.Types.ObjectId(storeId),
                    },
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        const statusCounts = counts.reduce((acc, { _id, count }) => {
            acc[_id] = count;
            return acc;
        }, {});

        return sendResponse({
            res,
            message: "Dashboard fetched successfully.",
            data: {
                store,
                stats: {
                    incoming: (statusCounts[BOOKING_STATUS.STORE_ASSIGNED] || 0) + 
                              (statusCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) + 
                              (statusCounts[BOOKING_STATUS.DRIVER_ARRIVED] || 0) + 
                              (statusCounts[BOOKING_STATUS.PICKED_UP] || 0) + 
                              (statusCounts[BOOKING_STATUS.AT_STORE] || 0),
                    stored: (statusCounts[BOOKING_STATUS.STORED] || 0) + 
                            (statusCounts[BOOKING_STATUS.RETURN_REQUESTED] || 0) + 
                            (statusCounts[BOOKING_STATUS.RETURN_DRIVER_ASSIGNED] || 0),
                    delivered: statusCounts[BOOKING_STATUS.DELIVERED] || 0,
                    cancelled: (statusCounts[BOOKING_STATUS.CANCELLED] || 0) + 
                               (statusCounts[BOOKING_STATUS.DRIVER_CANCELLED_CRITICAL] || 0),
                    capacityUsed: store.current_booking_count,
                    capacityAvailable: Math.max(0, store.max_booking_capacity - store.current_booking_count),
                },
            },
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
            return sendError(
                res,
                "Booking not found or not ready for return handover.",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Correctly read from delivery.assignment.returnOtp
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
                    "delivery.assignment.returnOtp": null, // Clear used OTP
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

        // 1. Decrement Store Capacity
        await decrementStoreCapacity(storeId);

        // 2. Clear cache
        await invalidateBookingCache(userId, booking_id).catch(() => { });

        // 3. Emit Socket Event
        try {
            const io = safeGetIO();
            if (io) {
                const driverId = updated.delivery?.assignment?.driverId?.toString();
                emitBookingOutForReturn(
                    io,
                    booking_id,
                    userId,
                    driverId,
                    now
                );
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