import Booking from "../../models/Booking.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
import logger from "../../utils/logger.js";

export const getDriverStats = async (req, res) => {
  try {
    const driverId = req.user.auth_id;

    // Get today's start and end date
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Get this week's start
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Aggregate query to find bookings where this driver was involved
    const driverBookings = await Booking.find({
      $or: [
        { "pickup.assignment.driverId": driverId },
        { "delivery.assignment.driverId": driverId }
      ],
      status: BOOKING_STATUS.DELIVERED
    }).select("pricing delivery createdAt");

    let totalDeliveries = driverBookings.length;
    let earningsToday = 0;
    let earningsThisWeek = 0;
    let availableBalance = 0; // Total all time earnings for now

    // Weekly Chart Data Initialization (Mon-Sun)
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const weeklyChart = days.map(day => ({ day, amount: 0 }));

    driverBookings.forEach((booking) => {
      // In a real app, driver cut would be calculated. Using totalAmount * 0.8 for mock realistic payout
      const payout = (booking.pricing?.totalAmount || 0) * 0.8;
      
      availableBalance += payout;

      const completionDate = booking.delivery?.completedAt || booking.createdAt;

      if (completionDate >= startOfToday && completionDate <= endOfToday) {
        earningsToday += payout;
      }

      if (completionDate >= startOfWeek) {
        earningsThisWeek += payout;
        const dayIndex = new Date(completionDate).getDay();
        weeklyChart[dayIndex].amount += payout;
      }
    });

    // Reorder chart from MON to SUN
    const reorderedChart = [...weeklyChart.slice(1), weeklyChart[0]];

    return sendResponse({
      res,
      message: "Stats fetched successfully",
      data: {
        availableBalance,
        earningsToday,
        earningsThisWeek,
        totalDeliveries,
        rating: 4.9, // Mock rating as DB doesn't have review collection yet
        weeklyChart: reorderedChart
      }
    });

  } catch (err) {
    logger.error("Get Driver Stats Error:", err);
    return sendError(res, "Failed to fetch driver statistics");
  }
};
