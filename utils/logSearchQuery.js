export const logSearchQuery = async ({
    query,
    lat,
    lng,
    radius,
    resultCount,
    userId,
}) => {
    if (process.env.NODE_ENV === "development") {
        console.log("Search Analytics:", {
            query,
            coordinates: lat && lng ? `${lat},${lng}` : null,
            radius,
            resultCount,
            userId: userId?.toString(),
            timestamp: new Date().toISOString(),
        });
    }
};