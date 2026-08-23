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
import { invalidateDriverCache } from "../../constants/redis/invalidate/driver.invalidate.js";
import { cacheAside } from "../../constants/redis/redisOperation.js";
import { StoreKeys, StoreTTL } from "../../constants/redis/store.keys.js";

const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};

const STORE_BOOKING_FIELDS = [
  "bookingCode", "status", "userId", "userInfo",
  "luggage", "luggagePhotos",
  "storage", "pricing", "deliveryLocation", "pickup.scheduledAt",
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
  "createdAt",
  "updatedAt",
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

        // Optional OTP check (only if sent)
        if (otp) {
            const storageOtp = booking.pickup?.assignment?.storageOtp;
            const isValid =
                storageOtp &&
                storageOtp.length === otp.toString().length &&
                timingSafeEqual(storageOtp, otp.toString());

            if (!isValid) {
                return sendError(res, "Invalid or expired OTP.", STATUS_CODES.BAD_REQUEST);
            }
        }

        const updated = await processMarkStored(booking_id, storeId, notes);

        if (!updated) {
            return sendError(res, "Booking is no longer eligible for this action.", STATUS_CODES.CONFLICT);
        }

        const userId = updated.userId.toString();
        const driverId = updated.pickup?.assignment?.driverId?.toString();

        await incrementStoreCapacity(storeId);

        // Clear user-facing, store-facing, and driver-facing caches
        await Promise.allSettled([
            invalidateBookingCache(userId, booking_id),
            invalidateStoreBookingCache(storeId, booking_id),
            driverId ? invalidateDriverCache(driverId, booking_id) : Promise.resolve(),
        ]);

        try {
            const io = safeGetIO();
            if (io) {
                emitBookingStored(io, booking_id, userId, storeId, updated.storage?.storedAt, "Your Store", driverId);
            }
        } catch (socketErr) {
            logger.debug(`[Store:Socket] Socket emission skipped: ${socketErr.message}`);
        }

        await Promise.allSettled([
            invalidateBookingCache(userId, booking_id),
            invalidateStoreBookingCache(storeId, booking_id),
            driverId ? invalidateDriverCache(driverId, booking_id) : Promise.resolve(),
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

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// STORE EARNING STATEMENTS & SETTLEMENTS (NO CUSTOMER INVOICES)
// ─────────────────────────────────────────────
import { getStoreOwnerSettlementData, getStorePeriodicSettlements } from "../../services/invoiceService.js";

// GET STORE EARNING STATEMENT DATA FOR BOOKING
export const getBookingSettlement = async (req, res) => {
    try {
        const { booking_id } = req.params;
        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const settlement = await getStoreOwnerSettlementData(booking_id);
        return sendResponse({
            res,
            message: "Store earning statement fetched successfully.",
            data: { settlement },
        });
    } catch (err) {
        logger.error("Get Booking Settlement Error:", err);
        return sendError(res, err.message || "Failed to fetch store earning statement.");
    }
};

// GET STORE EARNING STATEMENT PRINTABLE HTML / DOCUMENT
export const getBookingSettlementPdf = async (req, res) => {
    try {
        const { booking_id } = req.params;
        if (!mongoose.isValidObjectId(booking_id)) {
            return sendError(res, "Invalid booking ID.", STATUS_CODES.BAD_REQUEST);
        }

        const settlement = await getStoreOwnerSettlementData(booking_id);

        if (settlement.earningStatus === "PENDING" || !settlement.isDownloadable) {
            return sendError(
                res,
                "Earning statement is not downloadable while storage is in progress.",
                STATUS_CODES.CONFLICT
            );
        }

        const isProvisional = settlement.statementClassification === "PROVISIONAL";
        const titleHeader = isProvisional ? "PROVISIONAL EARNING STATEMENT" : "SETTLED EARNING STATEMENT";
        const badgeColor = isProvisional ? "#d97706" : "#0d9488";
        const badgeBg = isProvisional ? "#fef3c7" : "#ccfbf1";

        const startedDateStr = settlement.storagePeriod.startedAt
            ? new Date(settlement.storagePeriod.startedAt).toLocaleString()
            : "N/A";
        const releasedDateStr = settlement.storagePeriod.releasedAt
            ? new Date(settlement.storagePeriod.releasedAt).toLocaleString()
            : "N/A";

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>Store Earning Statement - ${settlement.statementId}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: 800; color: #0d9488; letter-spacing: -0.5px; }
        .subtitle { color: #64748b; font-size: 13px; margin-top: 4px; font-weight: 600; }
        .doc-title { font-size: 20px; font-weight: 800; text-align: right; color: #0f172a; margin: 0; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 6px; color: ${badgeColor}; background: ${badgeBg}; }
        .details { display: flex; justify-content: space-between; margin-top: 30px; gap: 20px; }
        .box { width: 48%; background: #f8fafc; border: 1px solid #f1f5f9; padding: 16px; border-radius: 12px; }
        .box h4 { margin: 0 0 8px 0; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .box p { margin: 4px 0; font-size: 13px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        th { background: #f1f5f9; border-bottom: 2px solid #e2e8f0; padding: 12px; text-align: left; font-size: 11px; color: #475569; text-transform: uppercase; font-weight: 800; }
        td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; font-weight: 500; }
        .totals { margin-top: 30px; margin-left: auto; width: 50%; }
        .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #475569; font-weight: 600; }
        .totals-row.final { font-size: 16px; font-weight: 800; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 10px; margin-top: 8px; }
        .payout-box { margin-top: 30px; padding: 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; font-size: 13px; color: #065f46; font-weight: 600; }
        .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; font-weight: 500; border-top: 1px solid #f1f5f9; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo">HOLDIT PLATFORM</div>
            <div class="subtitle">Store Partner Storage Earning Statement</div>
            <div style="font-size: 13px; font-weight: 700; margin-top: 4px;">Store: ${settlement.store.name}</div>
        </div>
        <div style="text-align: right;">
            <div class="doc-title">${titleHeader}</div>
            <div style="font-[mono]; font-weight: 800; font-size: 14px; margin-top: 4px;">Ref: ${settlement.statementId}</div>
            <div class="badge">${settlement.statementClassification}</div>
        </div>
    </div>

    <div class="details">
        <div class="box">
            <h4>Booking & Storage Period</h4>
            <p>Booking Code: <strong>${settlement.bookingCode}</strong></p>
            <p>Storage Started: <span>${startedDateStr}</span></p>
            <p>Storage Released: <span>${releasedDateStr}</span></p>
            <p>Billable Duration: <strong>${settlement.storagePeriod.billableHours} Hour(s)</strong></p>
        </div>
        <div class="box">
            <h4>Earning Status & Rates</h4>
            <p>Earning Status: <strong style="color: ${badgeColor};">${settlement.earningStatus}</strong></p>
            <p>Applied Store Rate: <strong>₹${settlement.rates.storeStorageHourlyRate} / hr</strong></p>
            <p>Statement Date: <span>${new Date(settlement.settlementDate).toLocaleDateString()}</span></p>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Earning Description</th>
                <th>Billable Units</th>
                <th style="text-align: right;">Rate (₹/hr)</th>
                <th style="text-align: right;">Amount (INR)</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Store Storage Facility Allocation</td>
                <td>${settlement.storagePeriod.billableHours} hr(s)</td>
                <td style="text-align: right;">₹${settlement.rates.storeStorageHourlyRate}</td>
                <td style="text-align: right; font-weight: 700;">₹${settlement.financials.grossStoreAmount.toFixed(2)}</td>
            </tr>
        </tbody>
    </table>

    <div class="totals">
        <div class="totals-row">
            <span>Gross Store Earnings:</span>
            <span>₹${settlement.financials.grossStoreAmount.toFixed(2)}</span>
        </div>
        ${settlement.financials.commissionDeduction > 0 ? `
        <div class="totals-row">
            <span>Platform Commission / Deductions:</span>
            <span>-₹${settlement.financials.commissionDeduction.toFixed(2)}</span>
        </div>
        ` : ''}
        <div class="totals-row final">
            <span>Net Store Payout:</span>
            <span>₹${settlement.financials.netStorePayout.toFixed(2)}</span>
        </div>
    </div>

    ${settlement.payout ? `
    <div class="payout-box">
        ✓ Disbursed via Bank Transfer: Ref #${settlement.payout.providerTransferId} on ${new Date(settlement.payout.completedAt).toLocaleDateString()}
    </div>
    ` : `
    <div style="margin-top: 30px; padding: 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; font-size: 12px; color: #92400e;">
        ⓘ Notice: This statement is provisional and represents accrued store earnings. Payout will be disbursed directly to your registered bank account upon settlement cycle execution.
    </div>
    `}

    <div class="footer">
        Holdit Luggage Storage Network — Confidential Store Partner Financial Settlement Document
    </div>
    <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(STATUS_CODES.SUCCESS).send(html);
    } catch (err) {
        logger.error("Get Booking Settlement PDF Error:", err);
        return sendError(res, "Failed to generate store earning statement.");
    }
};

// GET PERIODIC SETTLEMENT STATEMENTS FOR STORE OWNER / STORE
export const getPeriodicSettlements = async (req, res) => {
    try {
        const storeOwnerId = req.user.auth_id;
        const periods = await getStorePeriodicSettlements(storeOwnerId);

        return sendResponse({
            res,
            message: "Periodic settlement statements fetched successfully.",
            data: { settlements: periods },
        });
    } catch (err) {
        logger.error("Get Periodic Settlements Error:", err);
        return sendError(res, "Failed to fetch periodic settlement statements.");
    }
};

// GET PERIODIC SETTLEMENT PRINTABLE STATEMENT
export const getPeriodicSettlementPdf = async (req, res) => {
    try {
        const storeOwnerId = req.user.auth_id;
        const { period_id } = req.params;

        const periods = await getStorePeriodicSettlements(storeOwnerId);
        const period = periods.find(p => p.periodId === period_id) || periods[0];

        if (!period) {
            return sendError(res, "Settlement period not found.", STATUS_CODES.NOT_FOUND);
        }

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>Consolidated Payout Statement - ${period.periodLabel}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; max-width: 850px; margin: 0 auto; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: 800; color: #0d9488; }
        .doc-title { font-size: 20px; font-weight: 800; text-align: right; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        th { background: #f1f5f9; border-bottom: 2px solid #e2e8f0; padding: 12px; text-align: left; font-size: 11px; color: #475569; text-transform: uppercase; font-weight: 800; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .totals { margin-top: 30px; margin-left: auto; width: 45%; }
        .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; font-weight: 700; }
        .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #f1f5f9; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo">HOLDIT PLATFORM</div>
            <div style="color: #64748b; font-size: 13px; font-weight: 600; margin-top: 4px;">Consolidated Periodic Payout Statement</div>
        </div>
        <div style="text-align: right;">
            <div class="doc-title">${period.periodLabel}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Total Earnings: ${period.earningsCount} orders</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Booking Code</th>
                <th>Storage Start</th>
                <th>Storage Release</th>
                <th style="text-align: right;">Gross Earning</th>
                <th style="text-align: right;">Net Payout</th>
            </tr>
        </thead>
        <tbody>
            ${period.earnings.map(e => `
                <tr>
                    <td><strong>${e.bookingCode}</strong></td>
                    <td>${e.startedAt ? new Date(e.startedAt).toLocaleDateString() : 'N/A'}</td>
                    <td>${e.releasedAt ? new Date(e.releasedAt).toLocaleDateString() : 'N/A'}</td>
                    <td style="text-align: right;">₹${e.grossEarning.toFixed(2)}</td>
                    <td style="text-align: right; font-weight: 700;">₹${e.netEarning.toFixed(2)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="totals">
        <div class="totals-row" style="border-top: 2px solid #0f172a; padding-top: 10px; font-size: 16px;">
            <span>Total Consolidated Payout:</span>
            <span style="color: #0d9488;">₹${period.totalNetPayout.toFixed(2)}</span>
        </div>
    </div>

    <div class="footer">
        Holdit Luggage Storage Network — Consolidated Periodic Payout Statement
    </div>
    <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(STATUS_CODES.SUCCESS).send(html);
    } catch (err) {
        logger.error("Get Periodic Settlement PDF Error:", err);
        return sendError(res, "Failed to generate periodic settlement statement.");
    }
};