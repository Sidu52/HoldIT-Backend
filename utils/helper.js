export const getDateRange = (range) => {
  const now = new Date();
  let start;

  switch (range) {
    case "today":
      start = new Date();
      start.setHours(0, 0, 0, 0);
      break;

    case "week":
      start = new Date();
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;

    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case "last_3_months":
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;

    default:
      throw new Error("Invalid range");
  }

  return { start, end: now };
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const normalizeChartData = (data, range) => {
  if (range === "week") {
    return DAYS.map((day, index) => {
      const found = data.find(d => d._id.day === index + 1);
      return {
        day,
        value: found ? found.count : 0,
        maxValue: 100
      };
    });
  }

  return data.map(item => ({
    label: item._id.hour ?? item._id.day,
    value: item.count,
    maxValue: 100
  }));
};
