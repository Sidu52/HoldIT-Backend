// controllers/store/store.controller.js

import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS, ACCOUNT_STATUS } from "../../utils/constants.js";

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const store = await Store.findById(storeId)
            .select("-__v")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Profile fetched successfully.",
            data: { store },
        });
    } catch (err) {
        console.error("Store Get Profile Error:", err);
        return sendError(res, "Failed to fetch profile.");
    }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const {
            store_name,
            store_address,
            store_open_time,
            store_close_time,
            store_description,
            store_contact_number,
        } = req.body;

        const updated = await Store.findByIdAndUpdate(
            storeId,
            {
                $set: {
                    ...(store_name            && { store_name: store_name.trim() }),
                    ...(store_address         && { store_address: store_address.trim() }),
                    ...(store_open_time       && { store_open_time }),
                    ...(store_close_time      && { store_close_time }),
                    ...(store_description     && { store_description: store_description.trim() }),
                    ...(store_contact_number  && { store_contact_number }),
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
        console.error("Store Update Profile Error:", err);
        return sendError(res, "Failed to update profile.");
    }
};

// ─── GO ONLINE ────────────────────────────────────────────────────────────────
// Store must be ACTIVE + VERIFIED to go online
export const goOnline = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const store = await Store.findById(storeId)
            .select("status verification_status is_active is_online max_booking_capacity booking_assigned_count")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        if (store.status !== ACCOUNT_STATUS.ACTIVE) {
            return sendError(
                res,
                "Your store account is not active. Please contact support.",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (store.verification_status !== "verified") {
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
            $set: { is_online: true, last_active_at: new Date() },
        });

        return sendResponse({
            res,
            message: "Store is now online.",
            data: { is_online: true },
        });
    } catch (err) {
        console.error("Store Go Online Error:", err);
        return sendError(res, "Failed to update status.");
    }
};

// ─── GO OFFLINE ───────────────────────────────────────────────────────────────
export const goOffline = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        await Store.findByIdAndUpdate(storeId, {
            $set: { is_online: false, last_active_at: new Date() },
        });

        return sendResponse({
            res,
            message: "Store is now offline.",
            data: { is_online: false },
        });
    } catch (err) {
        console.error("Store Go Offline Error:", err);
        return sendError(res, "Failed to update status.");
    }
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
// Quick stats for the store's home screen
export const getDashboard = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const [store, counts] = await Promise.all([
            Store.findById(storeId)
                .select("store_name is_online booking_assigned_count max_booking_capacity rating")
                .lean(),
            Booking.aggregate([
                { $match: { storeId: storeId } },
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

        // Shape counts into a readable object
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
                    incoming:  statusCounts[BOOKING_STATUS.AT_STORE]  || 0,
                    stored:    statusCounts[BOOKING_STATUS.STORED]     || 0,
                    delivered: statusCounts[BOOKING_STATUS.DELIVERED]  || 0,
                    cancelled: statusCounts[BOOKING_STATUS.CANCELLED]  || 0,
                    capacityUsed:      store.booking_assigned_count,
                    capacityAvailable: store.max_booking_capacity - store.booking_assigned_count,
                },
            },
        });
    } catch (err) {
        console.error("Store Dashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};