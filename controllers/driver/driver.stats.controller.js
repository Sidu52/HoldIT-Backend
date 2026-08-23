import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import Earning, { EARNING_RECIPIENT } from "../../models/Earning.js";
import PaymentDistribution from "../../models/PaymentDistribution.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
import logger from "../../utils/logger.js";

// Day labels indexed by MongoDB $dayOfWeek (1 = Sun … 7 = Sat)
const DAYS_INDEXED = { 1: "SUN", 2: "MON", 3: "TUE", 4: "WED", 5: "THU", 6: "FRI", 7: "SAT" };

// Reorder from MON → SUN for the response
const ORDERED_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const getDriverStats = async (req, res) => {
    try {
        const driverId = new mongoose.Types.ObjectId(req.user.auth_id);

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        // Find all completed bookings assigned to this driver
        const COMPLETED_PICKUP_STATUSES = [
            BOOKING_STATUS.STORED,
            BOOKING_STATUS.RETURN_REQUESTED,
            BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
            BOOKING_STATUS.OUT_FOR_RETURN,
            BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
            BOOKING_STATUS.DELIVERED,
        ];

        const filter = {
            $or: [
                { "pickup.assignment.driverId": driverId, status: { $in: COMPLETED_PICKUP_STATUSES } },
                { "delivery.assignment.driverId": driverId, status: BOOKING_STATUS.DELIVERED },
            ],
        };

        const bookings = await Booking.find(filter)
            .select("pickup delivery pricing tipAmount createdAt updatedAt status")
            .lean();

        let totalDeliveries = bookings.length;
        let availableBalance = 0;
        let earningsToday = 0;
        let earningsThisWeek = 0;
        const chartByDay = {};

        for (const booking of bookings) {
            const isPickup = booking.pickup?.assignment?.driverId?.toString() === driverId.toString();
            const isDelivery = booking.delivery?.assignment?.driverId?.toString() === driverId.toString();

            // Default standard driver payout fee for pickup or delivery + tips
            let fee = 0;
            if (isPickup) {
                fee += (booking.pricing?.advanceBreakdown?.deliveryFee || 30);
            }
            if (isDelivery && isPickup) {
                fee += (booking.pricing?.distanceCharge || 30);
            } else if (isDelivery) {
                fee += (booking.pricing?.distanceCharge || 30);
            }

            const totalPayout = fee + (booking.tipAmount || 0);

            // Determine date
            const completionDate = (isPickup ? booking.pickup?.assignment?.completedAt : booking.delivery?.assignment?.completedAt)
                || booking.updatedAt
                || booking.createdAt;
            const dateObj = new Date(completionDate);

            availableBalance += totalPayout;

            if (dateObj >= startOfToday && dateObj <= endOfToday) {
                earningsToday += totalPayout;
            }

            if (dateObj >= startOfWeek) {
                earningsThisWeek += totalPayout;
                const dayIndex = dateObj.getDay() + 1; // 1 = Sun, 2 = Mon ...
                const dayLabel = DAYS_INDEXED[dayIndex];
                if (dayLabel) {
                    chartByDay[dayLabel] = (chartByDay[dayLabel] || 0) + totalPayout;
                }
            }
        }

        // Build weekly chart keyed MON → SUN
        const weeklyChart = ORDERED_DAYS.map((day) => ({ day, amount: chartByDay[day] ?? 0 }));

        return sendResponse({
            res,
            message: "Stats fetched successfully",
            data: {
                availableBalance: Number(availableBalance.toFixed(2)),
                earningsToday: Number(earningsToday.toFixed(2)),
                earningsThisWeek: Number(earningsThisWeek.toFixed(2)),
                totalDeliveries,
                rating: 4.9,
                weeklyChart,
            },
        });
    } catch (err) {
        logger.error("Get Driver Stats Error:", err);
        return sendError(res, "Failed to fetch driver statistics");
    }
};
