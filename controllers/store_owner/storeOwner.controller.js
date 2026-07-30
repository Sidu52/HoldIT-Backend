import mongoose from "mongoose";
import StoreOwner from "../../models/StoreOwner.js";
import Store from "../../models/Store.js";
import Booking from "../../models/Booking.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import {
    getCache,
    setCache,
    deleteCache,
    deleteByPattern,
    incrementCache,
} from "../../constants/redis/redisOperation.js";
import { StoreOwnerKeys, StoreOwnerTTL } from "../../constants/redis/storeOwner.keys.js";
import { StoreKeys, StoreTTL } from "../../constants/redis/store.keys.js";
import { AuthKeys, AuthTTL } from "../../constants/redis/auth.keys.js";
import { invalidateStoreOwnerCache } from "../../constants/redis/invalidate/storeOwner.invalidate.js";
import { invalidateStoreCache } from "../../constants/redis/invalidate/store.invalidate.js";
import {
    STATUS_CODES,
    ACCOUNT_STATUS,
    VERIFICATION_STATUS,
} from "../../utils/constants.js";
import {
    timingSafeEqual,
    checkOTPRateLimit,
    generateAndStoreOTP,
} from "../../helpers/user/authHelper.js";
import NotificationService from "../../services/NotificationService.js";
import { checkServiceability } from "../../helpers/user/addressHelper.js";
import logger from "../../utils/logger.js";

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────
export const getProfile = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const cacheKey = StoreOwnerKeys.profile(ownerId);

        const cached = await getCache(cacheKey);
        if (cached) {
            // getCache already returns parsed value; guard both cases
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse({ res, message: "Profile fetched.", data: { owner: data } });
        }

        const owner = await StoreOwner.findById(ownerId).select("-__v").lean();
        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        await setCache(cacheKey, owner, StoreOwnerTTL.PROFILE);

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
            phone,
            phoneOtp,
        } = req.body;

        const owner = await StoreOwner.findById(ownerId).lean();
        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        const updateData = {};
        if (first_name !== undefined) updateData.first_name = first_name.trim();
        if (last_name !== undefined) updateData.last_name = last_name.trim();
        if (email !== undefined) updateData.email = email.trim().toLowerCase();
        if (gender !== undefined) updateData.gender = gender;
        if (address !== undefined) updateData.address = address.trim();
        if (date_of_birth !== undefined) {
            updateData.date_of_birth = date_of_birth ? new Date(date_of_birth) : null;
        }

        // ── Phone change with OTP verification ──────
        if (phone !== undefined) {
            const sanitizedPhone = phone.replace(/[^0-9+]/g, "");

            if (sanitizedPhone !== owner.phone) {
                // Duplicate check
                const existingOwner = await StoreOwner.findOne({
                    phone: sanitizedPhone,
                    _id: { $ne: ownerId },
                }).lean();

                if (existingOwner) {
                    return sendError(
                        res,
                        "Phone number is already in use by another account.",
                        STATUS_CODES.CONFLICT
                    );
                }

                if (!phoneOtp) {
                    return sendError(
                        res,
                        "OTP is required to verify the new phone number.",
                        STATUS_CODES.BAD_REQUEST
                    );
                }

                // Fail-attempt gate
                const failKey = AuthKeys.otpFail("store_owner", sanitizedPhone);
                const failCount = await getCache(failKey);
                if (failCount && parseInt(failCount, 10) >= 5) {
                    await deleteCache(AuthKeys.otp("store_owner", sanitizedPhone));
                    return sendError(
                        res,
                        "Too many failed attempts. Please request a new OTP.",
                        STATUS_CODES.TOO_MANY_REQUESTS
                    );
                }

                const savedOTP = await getCache(AuthKeys.otp("store_owner", sanitizedPhone));
                const isOtpValid =
                    savedOTP &&
                    String(savedOTP).length === String(phoneOtp).length &&
                    timingSafeEqual(String(savedOTP), String(phoneOtp));

                if (!isOtpValid) {
                    await incrementCache(failKey, AuthTTL.OTP_FAIL_WINDOW);
                    return sendError(res, "Invalid or expired OTP.", STATUS_CODES.UNAUTHORIZED);
                }

                // Verified — clean up all OTP-related keys atomically
                await Promise.allSettled([
                    deleteCache(AuthKeys.otp("store_owner", sanitizedPhone)),
                    deleteCache(failKey),
                    deleteCache(AuthKeys.otpCooldown("store_owner", sanitizedPhone)),
                    deleteCache(AuthKeys.otpRate("store_owner", sanitizedPhone)),
                ]);

                updateData.phone = sanitizedPhone;
            }
        }

        const updatedOwner = await StoreOwner.findByIdAndUpdate(
            ownerId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select("-__v").lean();

        await deleteCache(StoreOwnerKeys.profile(ownerId));

        return sendResponse({ res, message: "Profile updated.", data: { owner: updatedOwner } });
    } catch (err) {
        logger.error("StoreOwner updateProfile Error:", err);
        return sendError(res, "Failed to update profile.");
    }
};

export const sendUpdatePhoneOTP = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const { phone } = req.body;

        if (!phone) {
            return sendError(res, "Phone number is required.", STATUS_CODES.BAD_REQUEST);
        }

        const sanitizedPhone = phone.replace(/[^0-9+]/g, "");

        const owner = await StoreOwner.findById(ownerId).select("phone").lean();
        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        if (owner.phone === sanitizedPhone) {
            return sendError(
                res,
                "New phone number cannot be the same as your current phone number.",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const existingOwner = await StoreOwner.findOne({ phone: sanitizedPhone }).lean();
        if (existingOwner) {
            return sendError(
                res,
                "This phone number is already registered by another account.",
                STATUS_CODES.CONFLICT
            );
        }

        const isRateLimited = await checkOTPRateLimit("store_owner", sanitizedPhone);
        if (isRateLimited) {
            return sendError(
                res,
                "Too many OTP requests. Please try again later.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        const cooldownKey = AuthKeys.otpCooldown("store_owner", sanitizedPhone);
        const cooldownExists = await getCache(cooldownKey);  // was: get(cooldownKey)
        if (cooldownExists) {
            return sendError(
                res,
                "Please wait before requesting another OTP.",
                STATUS_CODES.TOO_MANY_REQUESTS
            );
        }

        const otp = await generateAndStoreOTP("store_owner", sanitizedPhone);
        await setCache(cooldownKey, "1", AuthTTL.OTP_COOLDOWN);  
        await NotificationService.sendOTP(sanitizedPhone, otp);

        // Never expose OTP in production responses — remove `data.otp`
        return sendResponse({
            res,
            message: "OTP sent successfully to the new phone number.",
        });
    } catch (err) {
        logger.error("StoreOwner sendUpdatePhoneOTP Error:", err);
        return sendError(res, "Failed to send OTP.");
    }
};

export const completeProfile = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const { first_name, last_name, email, gender, date_of_birth, address } = req.body;

        const owner = await StoreOwner.findById(ownerId).select("onboarding_status").lean();
        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
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
                },
            },
            { new: true, runValidators: true }
        ).select("-__v").lean();

        await deleteCache(StoreOwnerKeys.profile(ownerId));

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

// ─────────────────────────────────────────────
// STORES
// ─────────────────────────────────────────────
export const getStores = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const cacheKey = StoreOwnerKeys.stores(ownerId);

        const cached = await getCache(cacheKey);        // was: get(cacheKey)
        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse({ res, message: "Stores fetched.", data: { stores: data } });
        }

        const stores = await Store.find({ store_owner_id: ownerId }).select("-__v").lean();

        await setCache(cacheKey, stores, StoreOwnerTTL.STORES);

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
            location,
        } = req.body;

        const { coordinates, address } = location || {};
        const [longitude, latitude] = coordinates || [];

        if (!longitude || !latitude) {
            return sendError(res, "Invalid location coordinates.", STATUS_CODES.BAD_REQUEST);
        }

        const owner = await StoreOwner.findById(ownerId)
            .select("onboarding_status status _id")
            .lean();

        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        const { isServiceable, serviceAreaId } = await checkServiceability(longitude, latitude);
        if (!isServiceable) {
            return sendError(
                res,
                "This location is not in our service area. You'll be notified when we expand.",
                STATUS_CODES.FORBIDDEN
            );
        }

        const phoneExists = await Store.exists({ phone });
        if (phoneExists) {
            return sendError(res, "A store with this phone number already exists.", STATUS_CODES.CONFLICT);
        }

        const store = await Store.create({
            store_owner_id: owner._id,
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
            account_status: ACCOUNT_STATUS.PENDING,
            verification_status: VERIFICATION_STATUS.PENDING,
        });

        await deleteCache(StoreOwnerKeys.stores(owner._id));

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Store created successfully. Pending admin verification.",
            data: { store },
        });
    } catch (err) {
        logger.error("StoreOwner createStore Error:", err);
        if (err.code === 11000) {
            return sendError(res, "Duplicate field value detected.", STATUS_CODES.CONFLICT);
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
            const { isServiceable, serviceAreaId } = await checkServiceability(longitude, latitude);

            if (!isServiceable) {
                return sendError(res, "This location is not in our service area.", STATUS_CODES.FORBIDDEN);
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
        ).select("-__v").lean();

        await Promise.allSettled([
            deleteCache(StoreOwnerKeys.stores(ownerId)),
            deleteCache(StoreKeys.publicView(id)),
        ]);

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
            .select("account_status is_online current_booking_count") // added account_status — it was missing but used below
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        // was: != (loose) — use strict equality
        if (store.account_status !== ACCOUNT_STATUS.ACTIVE) {
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
                account_status: ACCOUNT_STATUS.PENDING,
                verification_status: VERIFICATION_STATUS.PENDING,
                is_online: false,
                deactivated_at: new Date(),
            },
        });

        await Promise.allSettled([
            deleteByPattern(AuthKeys.refreshTokenPattern("store", id)),
            deleteByPattern(AuthKeys.accessTokenPattern("store", id)),
            deleteCache(StoreOwnerKeys.stores(ownerId)),
            deleteCache(StoreOwnerKeys.dashboard(ownerId)),
            deleteCache(StoreKeys.publicView(id)),
        ]);

        return sendResponse({ res, message: "Store deactivated successfully." });
    } catch (err) {
        logger.error("StoreOwner deleteStore Error:", err);
        return sendError(res, "Failed to deactivate store.");
    }
};

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
export const getDashboard = async (req, res) => {
    try {
        const ownerId = req.user.auth_id;
        const cacheKey = StoreOwnerKeys.dashboard(ownerId);

        const cached = await getCache(cacheKey);  // was: get(cacheKey)
        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse({ res, message: "Dashboard fetched.", data });
        }

        const stores = await Store.find({ store_owner_id: ownerId })
            .select("store_name verification_status is_online account_status rating rating_count current_booking_count max_booking_capacity")
            .lean();

        const totalStores = stores.length;
        const activeStores = stores.filter((s) => s.account_status === ACCOUNT_STATUS.ACTIVE).length;
        const onlineStores = stores.filter((s) => s.is_online).length;
        const pendingVerification = stores.filter((s) => s.verification_status === VERIFICATION_STATUS.PENDING).length;

        const storeIds = stores.map((s) => s._id);

        // Booking status breakdown — was grouping by "account_status" (wrong field)
        const bookingStats = await Booking.aggregate([
            { $match: { storeId: { $in: storeIds } } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        // Total revenue
        const revenueAggregate = await Booking.aggregate([
            { $match: { storeId: { $in: storeIds }, status: { $ne: "cancelled" } } },
            { $group: { _id: null, total: { $sum: "$pricing.totalAmount" } } },
        ]);
        const totalRevenue = revenueAggregate[0]?.total || 0;

        // Active vault count
        const activeVaultCount = await Booking.countDocuments({
            storeId: { $in: storeIds },
            status: "stored",
        });

        // Week-over-week growth
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const [currentWeekCount, previousWeekCount] = await Promise.all([
            Booking.countDocuments({ storeId: { $in: storeIds }, createdAt: { $gte: oneWeekAgo } }),
            Booking.countDocuments({ storeId: { $in: storeIds }, createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } }),
        ]);

        const growthPct =
            previousWeekCount > 0
                ? Math.round(((currentWeekCount - previousWeekCount) / previousWeekCount) * 100)
                : currentWeekCount > 0 ? 100 : 0;

        // Daily booking volume (last 7 days)
        const dailyVolumeAgg = await Booking.aggregate([
            { $match: { storeId: { $in: storeIds }, createdAt: { $gte: oneWeekAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const volumeHistory = [["Time", "Bookings"]];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split("T")[0];
            const match = dailyVolumeAgg.find((d) => d._id === dateStr);
            const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
            volumeHistory.push([dayLabel, match ? match.count : 0]);
        }

        // Earnings breakdown (placeholder percentages)
        const luggageStorage = Math.round(totalRevenue * 0.75);
        const insurance = Math.round(totalRevenue * 0.15);
        const courierService = Math.round(totalRevenue * 0.10);
        const earningsData = [
            ["Category", "Revenue"],
            ["Luggage Storage", luggageStorage || 0],
            ["Insurance", insurance || 0],
            ["Courier Service", courierService || 0],
        ];

        // Recent bookings
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
                growth: `${growthPct >= 0 ? "+" : ""}${growthPct}%`,
            },
            charts: {
                bookingVolume: volumeHistory,
                earningsData,
            },
            recentBookings,
            store_list: stores,
            orders: bookingStats,
        };

        await setCache(cacheKey, dashboard, StoreOwnerTTL.DASHBOARD);

        return sendResponse({ res, message: "Dashboard fetched.", data: dashboard });
    } catch (err) {
        logger.error("StoreOwner getDashboard Error:", err);
        return sendError(res, "Failed to fetch dashboard.");
    }
};

// ─────────────────────────────────────────────
// GO ONLINE / OFFLINE
// ─────────────────────────────────────────────
export const goOnline = async (req, res) => {
    try {
        const owner_id = req.user.auth_id;
        const { store_id } = req.params;
        const { is_online } = req.body;

        if (!mongoose.isValidObjectId(store_id)) {
            return sendError(res, "Invalid store ID.", STATUS_CODES.BAD_REQUEST);
        }

        // is_online must be a boolean — reject missing/invalid values
        if (typeof is_online !== "boolean") {
            return sendError(res, "is_online must be a boolean.", STATUS_CODES.BAD_REQUEST);
        }

        const owner = await StoreOwner.findById(owner_id).select("_id").lean();
        if (!owner) {
            return sendError(res, "Owner not found.", STATUS_CODES.NOT_FOUND);
        }

        const store = await Store.findOne({ _id: store_id, store_owner_id: owner._id })
            .select("account_status verification_status is_online")
            .lean();

        if (!store) {
            return sendError(res, "Store not found.", STATUS_CODES.NOT_FOUND);
        }

        if (
            store.account_status !== ACCOUNT_STATUS.ACTIVE ||
            store.verification_status !== VERIFICATION_STATUS.VERIFIED
        ) {
            return sendError(
                res,
                "Store must be verified and active before going online.",
                STATUS_CODES.FORBIDDEN
            );
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
        ).select("store_name is_online").lean();

        await Promise.allSettled([
            deleteCache(StoreOwnerKeys.stores(owner._id)),
            deleteCache(StoreOwnerKeys.dashboard(owner._id)),
        ]);

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