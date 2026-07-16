import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { getDateRange } from "../../utils/helper.js";
import { getCache, setCache } from "../../utils/cache.js";
import { ACCOUNT_STATUS, STATUS_CODES, VERIFICATION_STATUS, BOOKING_STATUS } from "../../utils/constants.js";
import { CACHE_TTL } from "../../utils/constants.js";
import logger from "../../utils/logger.js";

// Constants
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ENTITY_MODEL_MAP = { booking: Booking, user: User, driver: Driver, store: Store };

const todayRange = () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return { start, end };
};

const extractCount = (arr) => arr?.[0]?.count ?? 0;

// Format Helpers
const formatStatusWise = (statusData) => {
    const formatted = Object.fromEntries(Object.values(BOOKING_STATUS).map((s) => [s, 0]));
    statusData.forEach(({ _id, count }) => { if (_id) formatted[_id] = count; });
    return formatted;
};

const buildGroupFormat = (range) => {
    switch (range) {
        case "today": return { hour: { $hour: "$createdAt" } };
        case "week": return { day: { $dayOfWeek: "$createdAt" } };
        case "month": return { day: { $dayOfMonth: "$createdAt" } };
        case "last_3_months": return { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
        default: return { day: { $dayOfWeek: "$createdAt" } };
    }
};

const buildChartSort = (range) => {
    switch (range) {
        case "today": return { "_id.hour": 1 };
        case "last_3_months": return { "_id.year": 1, "_id.month": 1 };
        default: return { "_id.day": 1 };
    }
};

const normalizeChartData = (data, range) => {
    switch (range) {
        case "today":
            return Array.from({ length: 24 }, (_, hour) => ({
                label: `${String(hour).padStart(2, "0")}:00`,
                value: data.find((d) => d._id?.hour === hour)?.count ?? 0,
            }));

        case "week":
            return DAYS.map((day, i) => ({
                label: day,
                value: data.find((d) => d._id?.day === i + 1)?.count ?? 0,
            }));

        case "month": {
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            return Array.from({ length: daysInMonth }, (_, i) => ({
                label: String(i + 1),
                value: data.find((d) => d._id?.day === i + 1)?.count ?? 0,
            }));
        }

        case "last_3_months": {
            const now = new Date();
            return Array.from({ length: 3 }, (_, i) => {
                const date = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
                const month = date.getMonth() + 1;
                return {
                    label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
                    value: data.find((d) => d._id?.month === month && d._id?.year === date.getFullYear())?.count ?? 0,
                };
            });
        }

        default:
            return data.map((item) => ({ label: String(item._id?.day ?? item._id?.hour ?? "Unknown"), value: item?.count ?? 0 }));
    }
};

// DASHBOARD SUMMARY
export const getDashboardSummary = async (req, res) => {
    try {
        const cacheKey = "dashboard:summary";
        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Dashboard summary fetched successfully", data: cached });

        const { start, end } = todayRange();
        const todayFilter = { createdAt: { $gte: start, $lte: end } };

        const [bookingStats, userStats, driverStats, storeStats] = await Promise.all([
            Booking.aggregate([{
                $facet: {
                    total: [{ $count: "count" }],
                    totalToday: [{ $match: todayFilter }, { $count: "count" }],
                    statusWise: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                }
            }]),
            User.aggregate([{
                $facet: {
                    total: [{ $count: "count" }],
                    newToday: [{ $match: todayFilter }, { $count: "count" }],
                    active: [{ $match: { account_status: ACCOUNT_STATUS.ACTIVE } }, { $count: "count" }],
                }
            }]),
            Driver.aggregate([{
                $facet: {
                    total: [{ $count: "count" }],
                    verificationPending: [{ $match: { verification_status: VERIFICATION_STATUS.PENDING } }, { $count: "count" }],
                    online: [{ $match: { is_online: true } }, { $count: "count" }],
                    offline: [{ $match: { is_online: { $ne: true } } }, { $count: "count" }],
                    newToday: [{ $match: todayFilter }, { $count: "count" }],
                }
            }]),
            Store.aggregate([{
                $facet: {
                    total: [{ $count: "count" }],
                    online: [{ $match: { account_status: ACCOUNT_STATUS.ACTIVE } }, { $count: "count" }],
                    offline: [{ $match: { account_status: ACCOUNT_STATUS.INACTIVE } }, { $count: "count" }],
                }
            }]),
        ]);

        const b = bookingStats[0], u = userStats[0], d = driverStats[0], s = storeStats[0];

        const responseData = {
            bookings: { total: extractCount(b.total), totalToday: extractCount(b.totalToday), statusWise: formatStatusWise(b.statusWise) },
            users: { total: extractCount(u.total), newToday: extractCount(u.newToday), active: extractCount(u.active) },
            drivers: { total: extractCount(d.total), verificationPending: extractCount(d.verificationPending), online: extractCount(d.online), offline: extractCount(d.offline), newToday: extractCount(d.newToday) },
            stores: { total: extractCount(s.total), online: extractCount(s.online), offline: extractCount(s.offline) },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.SUMMARY);
        return sendResponse({ res, message: "Dashboard summary fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getDashboardSummary] Error:", err);
        return sendError(res, "Failed to fetch dashboard summary");
    }
};

// CHART DATA
export const getChartData = async (req, res) => {
    try {
        const { entity = "booking", range = "week", status } = req.query;

        const Model = ENTITY_MODEL_MAP[entity];
        if (!Model) return sendError(res, "Invalid entity type", STATUS_CODES.BAD_REQUEST);

        const cacheKey = `dashboard:chart:${entity}:${range}:${status || "all"}`;
        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Chart data fetched successfully", data: cached });

        const { start, end } = getDateRange(range);
        const matchFilter = { createdAt: { $gte: start, $lte: end }, ...(status && { status }) };

        const data = await Model.aggregate([
            { $match: matchFilter },
            { $group: { _id: buildGroupFormat(range), count: { $sum: 1 } } },
            { $sort: buildChartSort(range) },
        ]);

        const chart = normalizeChartData(data, range);
        const responseData = {
            entity, range,
            status: status || "all",
            total: chart.reduce((sum, item) => sum + item.value, 0),
            chart,
        };

        await setCache(cacheKey, responseData, CACHE_TTL.CHART);
        return sendResponse({ res, message: "Chart data fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getChartData] Error:", err);
        return sendError(res, "Failed to fetch chart data");
    }
};