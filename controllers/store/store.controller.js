import mongoose from "mongoose";
import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS, ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";
import { checkServiceability } from "../../utils/serviceable.js";
import logger from "../../utils/logger.js";
import { verifyStore } from "../../helpers/store/store.helper.js";

// GET PROFILE
export const getProfile = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const store = await Store.findById(storeId)
            .select("-__v")
            .lean();

        const storeCheck = verifyStore(store);
        if (!storeCheck.valid) {
            return sendError(res, storeCheck.message, storeCheck.code);
        }

        return sendResponse({
            res,
            message: "Profile fetched successfully.",
            data: { store },
        });
    } catch (err) {
        logger.error("Store Get Profile Error:", err);
        return sendError(res, "Failed to fetch profile.");
    }
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const {
            store_name,
            store_open_time,
            store_close_time,
            store_description,
            store_contact_number,
            location,
        } = req.body;

        const updated = await Store.findByIdAndUpdate(
            storeId,
            {
                $set: {
                    ...(store_name && { store_name: store_name.trim() }),
                    ...(store_open_time && { store_open_time }),
                    ...(store_close_time && { store_close_time }),
                    ...(store_description && { store_description: store_description.trim() }),
                    ...(store_contact_number && { store_contact_number }),
                    ...(location && { location: { type: "Point", coordinates: [location.longitude, location.latitude], address: location.address } }),
                },
            },
            { new: true, select: "-__v" }
        ).lean();

        if (!updated) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Profile updated successfully.",
            data: { store: updated },
        });
    } catch (err) {
        logger.error("Store Update Profile Error:", err);
        return sendError(res, "Failed to update profile.");
    }
};

// GO ONLINE
export const goOnline = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const { is_online } = req.body;

        const store = await Store.findById(storeId)
            .select("status verification_status is_active is_online max_booking_capacity current_booking_count")
            .lean();

       const storeCheck = verifyStore(store);
       if (!storeCheck.valid) {
           return sendError(res, storeCheck.message, storeCheck.code);
       }

        if (store.verification_status !== VERIFICATION_STATUS.VERIFIED) {
            return sendError(
                res,
                "Your store is not verified yet. Please wait for admin approval.",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (store.is_online === is_online) {
            return sendResponse({
                res,
                message: `Store is already ${is_online ? "online" : "offline"}.`,
                data: { is_online },
            });
        }

        await Store.findByIdAndUpdate(storeId, {
            $set: { is_online: !!is_online, last_active_at: new Date() },
        });

        return sendResponse({
            res,
            message: `Store is now ${is_online ? "online" : "offline"}.`,
            data: { is_online },
        });
    } catch (err) {
        logger.error("Store Go Online Error:", err);
        return sendError(res, "Failed to update status.");
    }
};

// DASHBOARD
export const getDashboard = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const store = await Store.findById(storeId)
            .select("store_name is_online current_booking_count max_booking_capacity rating")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        const counts = await Booking.aggregate([
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
        ]);

        const statusCounts = counts.reduce((acc, { _id, count }) => {
            acc[_id] = count;
            return acc;
        }, {});

        // 1. Total Revenue for this store
        const revenueAggregate = await Booking.aggregate([
            { $match: { storeId: new mongoose.Types.ObjectId(storeId), status: { $ne: "cancelled" } } },
            { $group: { _id: null, total: { $sum: "$pricing.totalAmount" } } }
        ]);
        const totalRevenue = revenueAggregate[0]?.total || 0;

        // 2. Calculate growth for this store
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const [currentWeekCount, previousWeekCount] = await Promise.all([
            Booking.countDocuments({ storeId: new mongoose.Types.ObjectId(storeId), createdAt: { $gte: oneWeekAgo } }),
            Booking.countDocuments({ storeId: new mongoose.Types.ObjectId(storeId), createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } })
        ]);

        const growthPct = previousWeekCount > 0
            ? Math.round(((currentWeekCount - previousWeekCount) / previousWeekCount) * 100)
            : currentWeekCount > 0 ? 100 : 0;

        // 3. Daily volume trend (Last 7 Days)
        const dailyVolumeAgg = await Booking.aggregate([
            {
                $match: {
                    storeId: new mongoose.Types.ObjectId(storeId),
                    createdAt: { $gte: oneWeekAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const volumeHistory = [["Time", "Bookings"]];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split("T")[0];
            const match = dailyVolumeAgg.find(d => d._id === dateStr);
            const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
            volumeHistory.push([dayLabel, match ? match.count : 0]);
        }

        // 4. Earnings pie chart categories
        const luggageStorage = Math.round(totalRevenue * 0.75);
        const insurance = Math.round(totalRevenue * 0.15);
        const courierService = Math.round(totalRevenue * 0.10);
        const earningsData = [
            ["Category", "Revenue"],
            ["Luggage Storage", luggageStorage || 0],
            ["Insurance", insurance || 0],
            ["Courier Service", courierService || 0]
        ];

        // 5. Recent bookings at this store
        const recentBookings = await Booking.find({ storeId: new mongoose.Types.ObjectId(storeId) })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("storeId", "store_name")
            .lean();

        return sendResponse({
            res,
            message: "Dashboard fetched successfully.",
            data: {
                store,
                stats: {
                    incoming: statusCounts[BOOKING_STATUS.PICKED_UP] || 0,
                    stored: statusCounts[BOOKING_STATUS.STORED] || 0,
                    delivered: statusCounts[BOOKING_STATUS.DELIVERED] || 0,
                    cancelled: statusCounts[BOOKING_STATUS.CANCELLED] || 0,
                    capacityUsed: store.current_booking_count || 0,
                    capacityAvailable: (store.max_booking_capacity - store.current_booking_count) || 0,
                },
                summary: {
                    revenue: totalRevenue,
                    activeVault: store.current_booking_count || 0,
                    locations: 1,
                    growth: `${growthPct >= 0 ? "+" : ""}${growthPct}%`
                },
                charts: {
                    bookingVolume: volumeHistory,
                    earningsData: earningsData
                },
                recentBookings: recentBookings
            },
        });
    } catch (err) {
        logger.error("Store Dashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};