export const getDateRange = (range) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999); // End of today

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


export const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
  // Validate inputs
  const coords = [lat1, lon1, lat2, lon2];
  if (coords.some((c) => typeof c !== "number" || Number.isNaN(c))) {
    throw new Error("All coordinates must be valid numbers");
  }

  if (
    lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 ||
    lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180
  ) {
    throw new Error("Coordinates out of valid range");
  }

  // Same point optimization
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // Earth's radius in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
