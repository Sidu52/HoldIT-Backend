import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";

export const getDashboardSummary = async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const [
            bookingStats,
            userStats,
            driverStats,
            storeStats
        ] = await Promise.all([
            // BOOKINGS
            Booking.aggregate([
                {
                    $facet: {
                        totalToday: [
                            { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } } },
                            { $count: "count" }
                        ],
                        statusWise: [
                            { $group: { _id: "$status", count: { $sum: 1 } } }
                        ]
                    }
                }
            ]),

            // USERS
            User.aggregate([
                {
                    $facet: {
                        totalUsers: [{ $count: "count" }],
                        newToday: [
                            { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } } },
                            { $count: "count" }
                        ]
                    }
                }
            ]),

            // DRIVERS
            Driver.aggregate([
                {
                    $facet: {
                        totalDrivers: [{ $count: "count" }],
                        verificationPending: [
                            { $match: { verification_status: "PENDING" } },
                            { $count: "count" }
                        ],
                        online: [
                            { $match: { is_Online: true } },
                            { $count: "count" }
                        ],
                        offline: [
                            { $match: { is_Online: false } },
                            { $count: "count" }
                        ]
                    }
                }
            ]),

            // STORES
            Store.aggregate([
                {
                    $facet: {
                        totalStores: [{ $count: "count" }],
                        online: [
                            { $match: { store_is_active: true } },
                            { $count: "count" }
                        ],
                        offline: [
                            { $match: { store_is_active: false } },
                            { $count: "count" }
                        ]
                    }
                }
            ])
        ]);

        return res.json({
            success: true,
            data: {
                booking: {
                    totalToday: bookingStats[0].totalToday[0]?.count || 0,
                    statusWise: bookingStats[0].statusWise
                },
                users: {
                    total: userStats[0].totalUsers[0]?.count || 0,
                    newToday: userStats[0].newToday[0]?.count || 0
                },
                drivers: {
                    total: driverStats[0].totalDrivers[0]?.count || 0,
                    verificationPending: driverStats[0].verificationPending[0]?.count || 0,
                    online: driverStats[0].online[0]?.count || 0,
                    offline: driverStats[0].offline[0]?.count || 0
                },
                stores: {
                    total: storeStats[0].totalStores[0]?.count || 0,
                    online: storeStats[0].online[0]?.count || 0,
                    offline: storeStats[0].offline[0]?.count || 0
                }
            }
        });
    } catch (error) {
        console.error("Dashboard summary error:", error);
        return res.status(500).json({
            success: false,
            message: "Dashboard data fetch failed"
        });
    }
};
