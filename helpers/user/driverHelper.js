import Driver from "../../models/Driver.js";
import Review from "../../models/Review.js";
import {
    DRIVER_VISIBILITY_FILTER,
} from "../../constants/user/driver.js";

// CACHE


export const findVisibleDriverById = async (driverId, selectFields) => {
    return Driver.findOne({
        _id: driverId,
        ...DRIVER_VISIBILITY_FILTER,
    })
        .select(selectFields)
        .lean();
};

export const fetchDriverReviews = async (driverId, skip, limit) => {
    const pipeline = [
        {
            $match: {
                driverId: driverId,
            },
        },
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                metadata: [
                    { $count: "total" },
                    {
                        $addFields: {
                            // Compute average from matched reviews
                        },
                    },
                ],
                reviews: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $lookup: {
                            from: "users",
                            localField: "userId",
                            foreignField: "_id",
                            as: "user",
                            pipeline: [
                                {
                                    $project: {
                                        first_name: 1,
                                        last_name: 1,
                                        _id: 0,
                                    },
                                },
                            ],
                        },
                    },
                    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            rating: 1,
                            comment: 1,
                            createdAt: 1,
                            "user.first_name": 1,
                            "user.last_name": 1,
                        },
                    },
                ],
            },
        },
    ];

    // Also compute rating summary separately for accuracy
    const [result] = await Review.aggregate(pipeline);

    const total = result.metadata[0]?.total || 0;
    const reviews = result.reviews || [];

    return { reviews, total };
};


export const fetchDriverRatingSummary = async (driverId) => {
    const [summary] = await Review.aggregate([
        {
            $match: {
                driverId: driverId,
            },
        },
        {
            $group: {
                _id: null,
                averageRating: { $avg: "$rating" },
                totalReviews: { $sum: 1 },
                star5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
                star4: { $sum: { $cond: [{ $gte: ["$rating", 4] }, 1, 0] } },
                star3: { $sum: { $cond: [{ $gte: ["$rating", 3] }, 1, 0] } },
                star2: { $sum: { $cond: [{ $gte: ["$rating", 2] }, 1, 0] } },
                star1: { $sum: { $cond: [{ $gte: ["$rating", 1] }, 1, 0] } },
            },
        },
        {
            $project: {
                _id: 0,
                averageRating: { $round: ["$averageRating", 1] },
                totalReviews: 1,
                distribution: {
                    5: "$star5",
                    4: { $subtract: ["$star4", "$star5"] },
                    3: { $subtract: ["$star3", "$star4"] },
                    2: { $subtract: ["$star2", "$star3"] },
                    1: { $subtract: ["$star1", "$star2"] },
                },
            },
        },
    ]);

    return summary || {
        averageRating: 0,
        totalReviews: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
};


export const transformDriverProfile = (driver) => {
    return {
        id: driver._id,
        name: formatDriverName(driver.first_name, driver.last_name),
        firstName: driver.first_name || null,
        lastName: driver.last_name || null,
        vehicleType: driver.vehicle_type || null,
        isOnline: driver.is_online,
        rating: driver.rating || 0,
        ratingCount: driver.rating_count || 0,
        currentArea: driver.currentLocation?.address || null,
    };
};


export const formatDriverName = (firstName, lastName) => {
    return [firstName, lastName].filter(Boolean).join(" ") || "Driver";
};

export { buildPagination } from "../../utils/helper.js";