import mongoose from "mongoose";
import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS, ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";
import { checkServiceability } from "../../utils/serviceable.js";

// ── GET PROFILE ───────────────────────────────────────────────────
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

// ── UPDATE PROFILE ────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const {
            store_name,
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

// ── GO ONLINE ─────────────────────────────────────────────────────
export const goOnline = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const store = await Store.findById(storeId)
            .select("status verification_status is_active is_online max_booking_capacity current_booking_count")
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

        if (!store.is_active) {
            return sendError(
                res,
                "Your store has been deactivated. Please contact support.",
                STATUS_CODES.FORBIDDEN
            );
        }

        // ✅ Fixed: was hardcoded "verified" string
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

// ── GO OFFLINE ────────────────────────────────────────────────────
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

// ── DASHBOARD ─────────────────────────────────────────────────────
export const getDashboard = async (req, res) => {
    try {
        const storeId = req.user.auth_id;

        const [store, counts] = await Promise.all([
            Store.findById(storeId)
                .select("store_name is_online current_booking_count max_booking_capacity rating")
                .lean(),
            // ✅ Fixed: cast storeId to ObjectId — aggregate doesn't auto-cast
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
                    incoming:          statusCounts[BOOKING_STATUS.PICKED_UP] || 0,
                    stored:            statusCounts[BOOKING_STATUS.STORED] || 0,
                    delivered:         statusCounts[BOOKING_STATUS.DELIVERED] || 0,
                    cancelled:         statusCounts[BOOKING_STATUS.CANCELLED] || 0,
                    capacityUsed:      store.current_booking_count,
                    capacityAvailable: store.max_booking_capacity - store.current_booking_count,
                },
            },
        });
    } catch (err) {
        console.error("Store Dashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};

// ── COMPLETE PROFILE ──────────────────────────────────────────────
export const completeProfile = async (req, res) => {
    try {
        const storeId = req.user.auth_id;
        const {
            store_name,
            store_open_time,
            store_close_time,
            store_description,
            store_contact_number,
            lat,
            lng,
            address,
        } = req.body;

        const store = await Store.findById(storeId)
            // ✅ Fixed: is_signup (was isSignUp)
            .select("is_signup status")
            .lean();

        if (!store) {
            return sendError(res, "Store not found", STATUS_CODES.NOT_FOUND);
        }

        // ✅ Fixed: is_signup (was isSignUp)
        if (store.is_signup) {
            return sendError(
                res,
                "Profile already completed. Use profile update instead.",
                STATUS_CODES.CONFLICT
            );
        }

        const { isServiceable, serviceAreaId } = await checkServiceability(lat, lng);

        if (!isServiceable) {
            return sendError(
                res,
                "Your location is not currently in our service area. You'll be notified when we expand.",
                STATUS_CODES.FORBIDDEN
            );
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                $set: {
                    store_name:           store_name.trim(),
                    store_open_time,
                    store_close_time,
                    store_description:    store_description.trim(),
                    store_contact_number,
                    location: {
                        type: "Point",
                        coordinates: [lng, lat],
                        address: address.trim(),
                    },
                    is_signup: true,
                    service_area_id: serviceAreaId,
                },
            },
            { new: true, runValidators: true }
        )
            .select("-__v")
            .lean();

        return sendResponse({
            res,
            message: "Profile completed successfully.",
            data: { store: updatedStore },
        });
    } catch (err) {
        console.error("Store Complete Profile Error:", err);
        return sendError(res, "Failed to complete profile.");
    }
};