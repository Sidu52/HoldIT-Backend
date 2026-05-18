import mongoose from "mongoose";
import StoreOwner from "../../models/StoreOwner.js";
import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set, del } from "../../services/redisService.js";
import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    ON_BOARDING_STATUS,
    VERIFICATION_STATUS,
} from "../../utils/constants.js";
import { checkServiceability } from "../../utils/serviceable.js";;
import logger from "../../utils/logger.js";
import Booking from "../../models/Booking.js";

const PROFILE_CACHE_TTL = 300;
const STORES_CACHE_TTL = 120;
const DASHBOARD_CACHE_TTL = 60;

// PROFILE
export const getProfile = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const cacheKey = `owner_profile:${ownerId}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({ res, message: "Profile fetched.", data: { owner: JSON.parse(cached) } });
        }

        const owner = await StoreOwner.findById(ownerId)
            .select("-__v")
            .lean();

        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        await set(cacheKey, JSON.stringify(owner), "EX", PROFILE_CACHE_TTL);

        return sendResponse({ res, message: "Profile fetched.", data: { owner } });
    } catch (err) {
        logger.error("StoreOwner getProfile Error:", err);
        return sendError(res, "Failed to fetch profile.");
    }
};

export const updateProfile = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const {
            first_name,
            last_name,
            email,
            gender,
            date_of_birth,
            address,
        } = req.body;

        const owner = await StoreOwner.findByIdAndUpdate(
            ownerId,
            {
                $set: {
                    ...(first_name && { first_name: first_name.trim() }),
                    ...(last_name && { last_name: last_name.trim() }),
                    ...(email && { email: email.trim().toLowerCase() }),
                    ...(gender && { gender }),
                    ...(date_of_birth && { date_of_birth }),
                    ...(address && { address: address.trim() }),
                },
            },
            { new: true, runValidators: true }
        )
            .select("-__v")
            .lean();



        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        await del(`owner_profile:${ownerId}`);

        return sendResponse({ res, message: "Profile updated.", data: { owner } });
    } catch (err) {
        logger.error("StoreOwner updateProfile Error:", err);
        return sendError(res, "Failed to update profile.");
    }
};

export const completeProfile = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const {
            first_name,
            last_name,
            email,
            gender,
            date_of_birth,
            address,
        } = req.body;

        const owner = await StoreOwner.findById(ownerId)
            .select("onboarding_status")
            .lean();

        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        if (owner.onboarding_status === ON_BOARDING_STATUS.COMPLETED) {
            return sendError(
                res,
                "Profile already completed. Use profile update instead.",
                STATUS_CODES.CONFLICT
            );
        }

        const updatedOwner = await StoreOwner.findByIdAndUpdate(
            ownerId,
            {
                $set: {
                    first_name: first_name.trim(),
                    last_name: last_name.trim(),
                    email: email.trim().toLowerCase(),
                    gender,
                    date_of_birth,
                    address: address?.trim(),
                    onboarding_status: ON_BOARDING_STATUS.COMPLETED,
                },
            },
            { new: true, runValidators: true }
        )
            .select("-__v")
            .lean();

        await del(`owner_profile:${ownerId}`);

        return sendResponse({
            res,
            message: "Profile completed successfully.",
            data: { owner: updatedOwner },
        });
    } catch (err) {
        logger.error("StoreOwner completeProfile Error:", err);
        return sendError(res, "Failed to complete profile.");
    }
};

// STORES
export const getStores = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const cacheKey = `owner_stores:${ownerId}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({ res, message: "Stores fetched.", data: { stores: JSON.parse(cached) } });
        }

        const stores = await Store.find({ store_owner_id: ownerId })
            .select("-__v")
            .lean();

        await set(cacheKey, JSON.stringify(stores), "EX", STORES_CACHE_TTL);

        return sendResponse({ res, message: "Stores fetched.", data: { stores } });
    } catch (err) {
        logger.error("StoreOwner getStores Error:", err);
        return sendError(res, "Failed to fetch stores.");
    }
};

export const getStore = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return sendError(res, "Invalid store ID.", STATUS_CODES.BAD_REQUEST);
        }

        const store = await Store.findOne({ _id: id, store_owner_id: ownerId })
            .select("-__v")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({ res, message: "Store fetched.", data: { store } });
    } catch (err) {
        logger.error("StoreOwner getStore Error:", err);
        return sendError(res, "Failed to fetch store.");
    }
};

export const createStore = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;

        const {
            phone,
            store_name,
            store_description,
            store_contact_number,
            store_open_time,
            store_close_time,
            location
        } = req.body;

        // Extract location safely
        const { coordinates, address } = location || {};
        const [longitude, latitude] = coordinates || [];

        // Validate coordinates presence (extra safety)
        if (!longitude || !latitude) {
            return sendError(res, "Invalid location coordinates.", STATUS_CODES.BAD_REQUEST);
        }

        // 🔹 Fix: Use correct query (auth_id vs _id)
        const owner = await StoreOwner.findById(ownerId)
            .select("onboarding_status status")
            .lean();

        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        if (owner.onboarding_status !== ON_BOARDING_STATUS.COMPLETED) {
            return sendError(
                res,
                "Please complete your profile before creating a store.",
                STATUS_CODES.FORBIDDEN
            );
        }

        // 🔹 Check serviceability
        const { isServiceable, serviceAreaId } = await checkServiceability(latitude, longitude);

        if (!isServiceable) {
            return sendError(
                res,
                "This location is not in our service area. You'll be notified when we expand.",
                STATUS_CODES.FORBIDDEN
            );
        }

        // 🔹 Prevent duplicate phone
        const phoneExists = await Store.exists({ phone });
        if (phoneExists) {
            return sendError(
                res,
                "A store with this phone number already exists.",
                STATUS_CODES.CONFLICT
            );
        }

        // 🔹 Create store
        const store = await Store.create({
            store_owner_id: owner._id, // important fix
            phone,
            store_name: store_name.trim(),
            store_description: store_description?.trim(),
            store_contact_number,
            store_open_time,
            store_close_time,
            location: {
                type: "Point",
                coordinates: [longitude, latitude],
                address: address?.trim(),
            },
            service_area_id: serviceAreaId,
            is_verified: false,
            is_active: true,
            status: ACCOUNT_STATUS.PENDING,
            verification_status: VERIFICATION_STATUS.PENDING,
        });

        // 🔹 Clear cache
        await del(`owner_stores:${owner._id}`);

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Store created successfully. Pending admin verification.",
            data: { store },
        });

    } catch (err) {
        logger.error("StoreOwner createStore Error:", err);

        // 🔴 Handle duplicate key error (safety fallback)
        if (err.code === 11000) {
            return sendError(
                res,
                "Duplicate field value detected.",
                STATUS_CODES.CONFLICT
            );
        }

        return sendError(res, "Failed to create store.");
    }
};

export const updateStore = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return sendError(res, "Invalid store ID.", STATUS_CODES.BAD_REQUEST);
        }

        const {
            store_name,
            store_description,
            store_contact_number,
            store_open_time,
            store_close_time,
            location,
        } = req.body;

        const store = await Store.findOne({ _id: id, store_owner_id: ownerId })
            .select("_id")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        const locationUpdate = {};
        if (location) {
            const { latitude, longitude, address } = location;
            const { isServiceable, serviceAreaId } = await checkServiceability(latitude, longitude);

            if (!isServiceable) {
                return sendError(
                    res,
                    "This location is not in our service area.",
                    STATUS_CODES.FORBIDDEN
                );
            }

            locationUpdate.location = {
                type: "Point",
                coordinates: [longitude, latitude],
                address: address.trim(),
            };
            locationUpdate.service_area_id = serviceAreaId;
        }

        const updatedStore = await Store.findByIdAndUpdate(
            id,
            {
                $set: {
                    ...(store_name && { store_name: store_name.trim() }),
                    ...(store_description && { store_description: store_description.trim() }),
                    ...(store_contact_number && { store_contact_number }),
                    ...(store_open_time && { store_open_time }),
                    ...(store_close_time && { store_close_time }),
                    ...locationUpdate,
                },
            },
            { new: true, runValidators: true }
        )
            .select("-__v")
            .lean();

        await del(`owner_stores:${ownerId}`);
        await del(`store:public:${id}`);

        return sendResponse({ res, message: "Store updated.", data: { store: updatedStore } });
    } catch (err) {
        logger.error("StoreOwner updateStore Error:", err);
        return sendError(res, "Failed to update store.");
    }
};

export const deleteStore = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return sendError(res, "Invalid store ID.", STATUS_CODES.BAD_REQUEST);
        }

        const store = await Store.findOne({ _id: id, store_owner_id: ownerId })
            .select("is_online is_active current_booking_count")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        if (!store.is_active) {
            return sendError(res, "Store is already deactivated.", STATUS_CODES.CONFLICT);
        }

        if (store.is_online) {
            return sendError(
                res,
                "Store is currently online. Please go offline before deactivating.",
                STATUS_CODES.CONFLICT
            );
        }

        if (store.current_booking_count > 0) {
            return sendError(
                res,
                "Store has active bookings. Please complete or cancel them before deactivating.",
                STATUS_CODES.CONFLICT
            );
        }

        await Store.findByIdAndUpdate(id, {
            $set: {
                is_active: false,
                is_online: false,
                deactivated_at: new Date(),
            },
        });

        await del(`owner_stores:${ownerId}`);
        await del(`owner_dashboard:${ownerId}`);
        await del(`store:public:${id}`);

        return sendResponse({ res, message: "Store deactivated successfully." });
    } catch (err) {
        logger.error("StoreOwner deleteStore Error:", err);
        return sendError(res, "Failed to deactivate store.");
    }
};

// DASHBOARD
export const getDashboard = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const cacheKey = `owner_dashboard:${ownerId}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({ res, message: "Dashboard fetched.", data: JSON.parse(cached) });
        }

        const stores = await Store.find({ store_owner_id: ownerId })
            .select("store_name status verification_status is_online is_active rating rating_count current_booking_count max_booking_capacity")
            .lean();

        const totalStores = stores.length;
        const activeStores = stores.filter(s => s.status === ACCOUNT_STATUS.ACTIVE).length;
        const onlineStores = stores.filter(s => s.is_online).length;
        const pendingVerification = stores.filter(
            s => s.verification_status === VERIFICATION_STATUS.PENDING
        ).length;

        const storeIds = stores.map(s => s._id);

        // 1. Aggregated bookings & orders
        const BookingStats = await Booking.aggregate([
            { $match: { storeId: { $in: storeIds } } },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                }
            }
        ]);

        // 2. Total Revenue from paid/stored/delivered bookings
        const revenueAggregate = await Booking.aggregate([
            { $match: { storeId: { $in: storeIds }, status: { $ne: "cancelled" } } },
            { $group: { _id: null, total: { $sum: "$pricing.totalAmount" } } }
        ]);
        const totalRevenue = revenueAggregate[0]?.total || 0;

        // 3. Stored/Active luggage in vault
        const activeVaultCount = await Booking.countDocuments({
            storeId: { $in: storeIds },
            status: "stored"
        });

        // 4. Calculate dynamic growth (bookings this week vs last week)
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const [currentWeekCount, previousWeekCount] = await Promise.all([
            Booking.countDocuments({ storeId: { $in: storeIds }, createdAt: { $gte: oneWeekAgo } }),
            Booking.countDocuments({ storeId: { $in: storeIds }, createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } })
        ]);

        const growthPct = previousWeekCount > 0
            ? Math.round(((currentWeekCount - previousWeekCount) / previousWeekCount) * 100)
            : currentWeekCount > 0 ? 100 : 0;

        // 5. Booking volume hourly/daily chart data (Last 7 Days)
        const dailyVolumeAgg = await Booking.aggregate([
            {
                $match: {
                    storeId: { $in: storeIds },
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

        // 6. Category breakdown for pie chart
        const luggageStorage = Math.round(totalRevenue * 0.75);
        const insurance = Math.round(totalRevenue * 0.15);
        const courierService = Math.round(totalRevenue * 0.10);
        const earningsData = [
            ["Category", "Revenue"],
            ["Luggage Storage", luggageStorage || 0],
            ["Insurance", insurance || 0],
            ["Courier Service", courierService || 0]
        ];

        // 7. Recent bookings list
        const recentBookings = await Booking.find({ storeId: { $in: storeIds } })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("storeId", "store_name")
            .lean();

        const avgRating =
            stores.length > 0
                ? (stores.reduce((sum, s) => sum + (s.rating || 0), 0) / stores.length).toFixed(2)
                : 0;

        const dashboard = {
            stores: {
                total: totalStores,
                active: activeStores,
                online: onlineStores,
                pending_verification: pendingVerification,
            },
            rating: {
                average: parseFloat(avgRating),
            },
            summary: {
                revenue: totalRevenue,
                activeVault: activeVaultCount,
                locations: totalStores,
                growth: `${growthPct >= 0 ? "+" : ""}${growthPct}%`
            },
            charts: {
                bookingVolume: volumeHistory,
                earningsData: earningsData
            },
            recentBookings: recentBookings,
            store_list: stores,
            orders: BookingStats
        };

        await set(cacheKey, JSON.stringify(dashboard), "EX", DASHBOARD_CACHE_TTL);

        return sendResponse({ res, message: "Dashboard fetched.", data: dashboard });
    } catch (err) {
        logger.error("StoreOwner getDashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};

export const goOnline = async (req, res) => {
    try {
        const owner_id = req.user.auth_id;
        const { store_id } = req.params;
        const { is_online } = req.body;


        if (!mongoose.isValidObjectId(store_id)) {
            return sendError(res, "Invalid store ID.", STATUS_CODES.BAD_REQUEST);
        }

        const owner = await StoreOwner.findById(owner_id)
            .select("_id")
            .lean();

        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        const store = await Store.findOne({
            _id: store_id,
            store_owner_id: owner._id,
        })
            .select("status verification_status is_active is_online")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        if (
            store.status !== ACCOUNT_STATUS.ACTIVE ||
            store.verification_status !== VERIFICATION_STATUS.VERIFIED
        ) {
            return sendError(
                res,
                "Store must be verified and active before going online.",
                STATUS_CODES.FORBIDDEN
            );
        }

        if (!store.is_active) {
            return sendError(res, "Store is deactivated.", STATUS_CODES.FORBIDDEN);
        }

        if (store.is_online === is_online) {
            return sendError(
                res,
                `Store is already ${is_online ? "online" : "offline"}.`,
                STATUS_CODES.CONFLICT
            );
        }

        const updatedStore = await Store.findByIdAndUpdate(
            store_id,
            { $set: { is_online } },
            { new: true }
        )
            .select("store_name is_online status")
            .lean();

        await del(`owner_stores:${owner._id}`);
        await del(`owner_dashboard:${owner._id}`);

        return sendResponse({
            res,
            message: `Store is now ${is_online ? "online" : "offline"}.`,
            data: { store: updatedStore },
        });

    } catch (err) {
        logger.error("StoreOwner goOnline Error:", err);
        return sendError(res, "Failed to update store status.");
    }
};