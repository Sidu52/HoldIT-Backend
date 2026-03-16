import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { getDateRange } from "../../utils/helper.js";
import { get, set } from "../../services/redisService.js";
import { BOOKING_STATUS, STATUS_CODES } from "../../utils/constants.js";

// CONSTANTS
const SUMMARY_CACHE_TTL = 60; // 1 minute
const CHART_CACHE_TTL = 120; // 2 minutes

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Entity to Model mapping
const ENTITY_MODEL_MAP = {
    booking: Booking,
    user: User,
    driver: Driver,
    store: Store,
};

// Format Status-Wise Data
const formatStatusWise = (statusData) => {
    // Initialize all statuses with 0
    const formatted = {};
    Object.values(BOOKING_STATUS).forEach((status) => {
        formatted[status] = 0;
    });

    // Fill in actual counts
    statusData.forEach(({ _id, count }) => {
        if (_id) formatted[_id] = count;
    });

    return formatted;
};

// Build Group Format for Aggregation
const buildGroupFormat = (range) => {
    switch (range) {
        case "today":
            return { hour: { $hour: "$createdAt" } };

        case "week":
            return { day: { $dayOfWeek: "$createdAt" } };

        case "month":
            return { day: { $dayOfMonth: "$createdAt" } };

        case "last_3_months":
            return {
                month: { $month: "$createdAt" },
                year: { $year: "$createdAt" },
            };

        default:
            return { day: { $dayOfWeek: "$createdAt" } };
    }
};

// Build Sort for Chart Data
const buildChartSort = (range) => {
    switch (range) {
        case "today":
            return { "_id.hour": 1 };
        case "week":
            return { "_id.day": 1 };
        case "month":
            return { "_id.day": 1 };
        case "last_3_months":
            return { "_id.year": 1, "_id.month": 1 };
        default:
            return { "_id.day": 1 };
    }
};

// Normalize Chart Data
const normalizeChartData = (data, range) => {
    switch (range) {
        case "today":
            // Fill all 24 hours
            return Array.from({ length: 24 }, (_, hour) => {
                const found = data.find((d) => d._id?.hour === hour);
                return {
                    label: `${hour.toString().padStart(2, "0")}:00`,
                    value: found?.count ?? 0,
                };
            });

        case "week":
            // MongoDB $dayOfWeek: Sunday = 1, Saturday = 7
            return DAYS.map((day, index) => {
                const mongoDayOfWeek = index + 1;
                const found = data.find((d) => d._id?.day === mongoDayOfWeek);
                return {
                    label: day,
                    value: found?.count ?? 0,
                };
            });

        case "month": {
            // Fill all days of the current month
            const now = new Date();
            const daysInMonth = new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0
            ).getDate();

            return Array.from({ length: daysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const found = data.find((d) => d._id?.day === dayNum);
                return {
                    label: `${dayNum}`,
                    value: found?.count ?? 0,
                };
            });
        }

        case "last_3_months": {
            // Fill last 3 months
            const now = new Date();
            const result = [];

            for (let i = 2; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const month = date.getMonth() + 1; // 1-indexed
                const year = date.getFullYear();

                const found = data.find(
                    (d) => d._id?.month === month && d._id?.year === year
                );

                result.push({
                    label: `${MONTHS[date.getMonth()]} ${year}`,
                    value: found?.count ?? 0,
                });
            }

            return result;
        }

        default:
            return data.map((item) => ({
                label: String(item._id?.day ?? item._id?.hour ?? "Unknown"),
                value: item?.count ?? 0,
            }));
    }
};

// DASHBOARD SUMMARY
export const getDashboardSummary = async (req, res) => {
    try {
        const cacheKey = "dashboard:summary";

        // Check cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Dashboard summary fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Date boundaries for "today"
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const todayFilter = {
            createdAt: { $gte: startOfToday, $lte: endOfToday },
        };

        const [
            bookingStats,
            userStats,
            driverStats,
            storeStats,
        ] = await Promise.all([
            // BOOKINGS
            Booking.aggregate([
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        totalToday: [
                            { $match: todayFilter },
                            { $count: "count" },
                        ],
                        statusWise: [
                            {
                                $group: {
                                    _id: "$status",
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                    },
                },
            ]),

            // USERS
            User.aggregate([
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        newToday: [
                            { $match: todayFilter },
                            { $count: "count" },
                        ],
                        active: [
                            { $match: { status: "active" } },
                            { $count: "count" },
                        ],
                    },
                },
            ]),

            // DRIVERS
            Driver.aggregate([
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        verificationPending: [
                            { $match: { verification_status: "PENDING" } },
                            { $count: "count" },
                        ],
                        online: [
                            { $match: { is_Online: true } },
                            { $count: "count" },
                        ],
                        offline: [
                            { $match: { is_Online: false } },
                            { $count: "count" },
                        ],
                        newToday: [
                            { $match: todayFilter },
                            { $count: "count" },
                        ],
                    },
                },
            ]),

            // STORES
            Store.aggregate([
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        online: [
                            { $match: { store_is_active: true } },
                            { $count: "count" },
                        ],
                        offline: [
                            { $match: { store_is_active: false } },
                            { $count: "count" },
                        ],
                    },
                },
            ]),
        ]);

        // Extract helper
        const extractCount = (arr) => arr?.[0]?.count ?? 0;

        const responseData = {
            bookings: {
                total: extractCount(bookingStats[0].total),
                totalToday: extractCount(bookingStats[0].totalToday),
                statusWise: formatStatusWise(bookingStats[0].statusWise),
            },
            users: {
                total: extractCount(userStats[0].total),
                newToday: extractCount(userStats[0].newToday),
                active: extractCount(userStats[0].active),
            },
            drivers: {
                total: extractCount(driverStats[0].total),
                verificationPending: extractCount(
                    driverStats[0].verificationPending
                ),
                online: extractCount(driverStats[0].online),
                offline: extractCount(driverStats[0].offline),
                newToday: extractCount(driverStats[0].newToday),
            },
            stores: {
                total: extractCount(storeStats[0].total),
                online: extractCount(storeStats[0].online),
                offline: extractCount(storeStats[0].offline),
            },
        };

        // Cache result
        await set(cacheKey, JSON.stringify(responseData), "EX", SUMMARY_CACHE_TTL);

        return sendResponse({
            res,
            message: "Dashboard summary fetched successfully",
            data: responseData,
        });
    } catch (error) {
        console.error("Dashboard Summary Error:", error);
        return sendError(res, "Failed to fetch dashboard summary");
    }
};

// CHART DATA
export const getChartData = async (req, res) => {
    try {
        const { entity = "booking", range = "week", status } = req.query;
        // Cache key
        const cacheKey = `dashboard:chart:${entity}:${range}:${status || "all"}`;

        // Check cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Chart data fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Get model
        const Model = ENTITY_MODEL_MAP[entity];
        if (!Model) {
            return sendError(
                res,
                "Invalid entity type",
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Get date range
        const { start, end } = getDateRange(range);

        // Build match filter
        const matchFilter = {
            createdAt: { $gte: start, $lte: end },
        };

        // Optional status filter
        if (status) {
            matchFilter.status = status;
        }

        // Build aggregation
        const groupFormat = buildGroupFormat(range);
        const sortOrder = buildChartSort(range);

        const data = await Model.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: groupFormat,
                    count: { $sum: 1 },
                },
            },
            { $sort: sortOrder },
        ]);

        // Normalize data for frontend
        const chart = normalizeChartData(data, range);

        const responseData = {
            entity,
            range,
            status: status || "all",
            total: chart.reduce((sum, item) => sum + item.value, 0),
            chart,
        };

        // Cache result
        await set(
            cacheKey,
            JSON.stringify(responseData),
            "EX",
            CHART_CACHE_TTL
        );

        return sendResponse({
            res,
            message: "Chart data fetched successfully",
            data: responseData,
        });
    } catch (error) {
        console.error("Chart Data Error:", error);
        return sendError(res, "Failed to fetch chart data");
    }
};