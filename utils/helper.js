import { BOOKING_STATUS } from "./constants.js";
import logger from "./logger.js";
export { setAuthCookies } from "./token.js";


export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getDateRange = (range) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start;

  switch (range) {
    case "today":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;

    case "week":
      start = new Date(now);
      start.setDate(now.getDate() - 6); // Last 7 days including today
      start.setHours(0, 0, 0, 0);
      break;

    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;

    case "last_3_months":
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      start.setHours(0, 0, 0, 0);
      break;

    default:
      throw new Error(`Invalid date range: "${range}". Expected: today, week, month, last_3_months`);
  }

  return { start, end };
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const normalizeChartData = (data = [], range) => {
  if (!Array.isArray(data)) {
    throw new Error("Chart data must be an array");
  }

  if (range === "week") {
    // MongoDB $dayOfWeek: Sunday = 1, Monday = 2, ..., Saturday = 7
    return DAYS.map((day, index) => {
      const mongoDayOfWeek = index + 1; // Sun=1, Mon=2, ..., Sat=7
      const found = data.find((d) => d._id?.day === mongoDayOfWeek);
      return {
        day,
        value: found?.count ?? 0,
      };
    });
  }

  if (range === "today") {
    // Fill all 24 hours
    return Array.from({ length: 24 }, (_, hour) => {
      const found = data.find((d) => d._id?.hour === hour);
      return {
        label: `${hour.toString().padStart(2, "0")}:00`,
        value: found?.count ?? 0,
      };
    });
  }

  if (range === "month" || range === "last_3_months") {
    return data.map((item) => ({
      label: item._id?.day ?? item._id?.month ?? "Unknown",
      value: item?.count ?? 0,
    }));
  }

  throw new Error(`Unsupported chart range: "${range}"`);
};

// Add this helper at the top of booking.admin.controller.js (after imports)
export const safeAbortSession = async (session) => {
  try {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
  } catch (err) {
    logger.warn("[safeAbortSession] Failed to abort transaction:", err.message);
  } finally {
    session.endSession();
  }
};

export const buildPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export { isValidStatusTransition } from "../helpers/user/bookingHelper.js";
