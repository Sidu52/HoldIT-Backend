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

        if (store.is_online) {
            return sendResponse({
                res,
                message: "Store is already online.",
                data: { is_online: true },
            });
        }

        await Store.findByIdAndUpdate(storeId, {
            $set: { is_online, last_active_at: new Date() },
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
                    incoming: statusCounts[BOOKING_STATUS.PICKED_UP] || 0,
                    stored: statusCounts[BOOKING_STATUS.STORED] || 0,
                    delivered: statusCounts[BOOKING_STATUS.DELIVERED] || 0,
                    cancelled: statusCounts[BOOKING_STATUS.CANCELLED] || 0,
                    capacityUsed: store.current_booking_count,
                    capacityAvailable: store.max_booking_capacity - store.current_booking_count,
                },
            },
        });
    } catch (err) {
        logger.error("Store Dashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};