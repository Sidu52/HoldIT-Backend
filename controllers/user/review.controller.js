import Review from "../../models/Review.js";
import Booking from "../../models/Booking.js";
import Driver from "../../models/Driver.js";
import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, BOOKING_STATUS } from "../../utils/constants.js";
import asyncHandler from "express-async-handler";
import logger from "../../utils/logger.js";
import mongoose from "mongoose";

/**
 * @desc Create a review for a Driver, Store, or Platform (supports multi-category or single)
 * @route POST /api/v1/user/reviews
 * @access Private (User)
 */
export const createReview = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;
    const bookingId = req.params?.bookingId || req.params?.booking_id || req.body?.bookingId;
    const {
        // Multi-category payload
        driverRating,
        driverTags,
        driverFeedback,
        storeRating,
        storeTags,
        storeFeedback,
        platformRating,
        platformTags,
        overallFeedback,
        // Single review payload fallback
        rating,
        comment,
        tags,
        reviewType
    } = req.body;

    if (!bookingId) {
        return sendError(res, "Booking ID is required", STATUS_CODES.BAD_REQUEST);
    }

    const booking = await Booking.findOne({ _id: bookingId, userId });
    if (!booking) {
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }

    const isDelivered = [
        BOOKING_STATUS.DELIVERED,
        "completed",
        "delivered"
    ].includes((booking.status || "").toLowerCase());

    if (!isDelivered) {
        return sendError(res, "Reviews can only be submitted for completed/delivered bookings", STATUS_CODES.BAD_REQUEST);
    }

    const driverId = booking.delivery?.assignment?.driverId || booking.pickup?.assignment?.driverId;
    const storeId = booking.storeId;

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const createdReviews = [];

        // CASE 1: Multi-Category Review (Driver + Store + Platform)
        if (driverRating || storeRating || platformRating) {
            // 1. Driver Review
            if (driverRating && driverRating >= 1 && driverRating <= 5 && driverId) {
                const existingDriverReview = await Review.findOne({ bookingId, userId, reviewType: "DRIVER" }).session(session);
                if (!existingDriverReview) {
                    const [rev] = await Review.create([{
                        bookingId,
                        userId,
                        driverId,
                        reviewType: "DRIVER",
                        rating: driverRating,
                        tags: Array.isArray(driverTags) ? driverTags : [],
                        comment: driverFeedback || ""
                    }], { session });
                    createdReviews.push(rev);

                    // Update Driver rating average & count
                    const driver = await Driver.findById(driverId).session(session);
                    if (driver) {
                        const totalRating = ((driver.rating_avg || 0) * (driver.rating_count || 0)) + driverRating;
                        driver.rating_count = (driver.rating_count || 0) + 1;
                        driver.rating_avg = parseFloat((totalRating / driver.rating_count).toFixed(2));
                        await driver.save({ session });
                    }
                }
            }

            // 2. Store Facility Review
            if (storeRating && storeRating >= 1 && storeRating <= 5 && storeId) {
                const existingStoreReview = await Review.findOne({ bookingId, userId, reviewType: "STORE" }).session(session);
                if (!existingStoreReview) {
                    const [rev] = await Review.create([{
                        bookingId,
                        userId,
                        storeId,
                        reviewType: "STORE",
                        rating: storeRating,
                        tags: Array.isArray(storeTags) ? storeTags : [],
                        comment: storeFeedback || ""
                    }], { session });
                    createdReviews.push(rev);

                    // Update Store rating average & count
                    const store = await Store.findById(storeId).session(session);
                    if (store) {
                        const totalRating = ((store.rating_avg || 0) * (store.rating_count || 0)) + storeRating;
                        store.rating_count = (store.rating_count || 0) + 1;
                        store.rating_avg = parseFloat((totalRating / store.rating_count).toFixed(2));
                        await store.save({ session });
                    }
                }
            }

            // 3. Platform Experience Review
            if (platformRating && platformRating >= 1 && platformRating <= 5) {
                const existingPlatformReview = await Review.findOne({ bookingId, userId, reviewType: "PLATFORM" }).session(session);
                if (!existingPlatformReview) {
                    const [rev] = await Review.create([{
                        bookingId,
                        userId,
                        reviewType: "PLATFORM",
                        rating: platformRating,
                        tags: Array.isArray(platformTags) ? platformTags : [],
                        comment: overallFeedback || ""
                    }], { session });
                    createdReviews.push(rev);
                }
            }
        } 
        // CASE 2: Single Review Submission (DRIVER / STORE / PLATFORM)
        else if (rating && reviewType) {
            const targetId = reviewType === "DRIVER" ? driverId : (reviewType === "STORE" ? storeId : null);

            const existingReview = await Review.findOne({ bookingId, userId, reviewType }).session(session);
            if (existingReview) {
                await session.abortTransaction();
                session.endSession();
                return sendError(res, `You have already reviewed this ${reviewType.toLowerCase()}`, STATUS_CODES.CONFLICT);
            }

            const [rev] = await Review.create([{
                bookingId,
                userId,
                driverId: reviewType === "DRIVER" ? targetId : null,
                storeId: reviewType === "STORE" ? targetId : null,
                reviewType,
                rating,
                tags: Array.isArray(tags) ? tags : [],
                comment: comment || ""
            }], { session });
            createdReviews.push(rev);

            if (reviewType === "DRIVER" && targetId) {
                const driver = await Driver.findById(targetId).session(session);
                if (driver) {
                    const totalRating = ((driver.rating_avg || 0) * (driver.rating_count || 0)) + rating;
                    driver.rating_count = (driver.rating_count || 0) + 1;
                    driver.rating_avg = parseFloat((totalRating / driver.rating_count).toFixed(2));
                    await driver.save({ session });
                }
            } else if (reviewType === "STORE" && targetId) {
                const store = await Store.findById(targetId).session(session);
                if (store) {
                    const totalRating = ((store.rating_avg || 0) * (store.rating_count || 0)) + rating;
                    store.rating_count = (store.rating_count || 0) + 1;
                    store.rating_avg = parseFloat((totalRating / store.rating_count).toFixed(2));
                    await store.save({ session });
                }
            }
        } else {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, "Rating details are required", STATUS_CODES.BAD_REQUEST);
        }

        // Mark booking as reviewed
        booking.isReviewed = true;
        await booking.save({ session });

        await session.commitTransaction();
        session.endSession();

        return sendResponse({
            res,
            message: "Reviews submitted and ratings updated successfully",
            data: {
                reviews: createdReviews,
                bookingId
            }
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        logger.error("[Review:Create] Error:", err);
        return sendError(res, "Failed to submit review");
    }
});

/**
 * @desc Get reviews for a Driver or Store
 * @route GET /api/v1/user/reviews
 * @access Private (User)
 */
export const getReviews = asyncHandler(async (req, res) => {
    const { driverId, storeId, bookingId, page = 1, limit = 10 } = req.query;

    const filter = { is_active: true };
    if (driverId) filter.driverId = driverId;
    if (storeId) filter.storeId = storeId;
    if (bookingId) filter.bookingId = bookingId;

    if (!driverId && !storeId && !bookingId) {
        return sendError(res, "Driver ID, Store ID, or Booking ID is required", STATUS_CODES.BAD_REQUEST);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
        Review.find(filter)
            .populate("userId", "first_name last_name avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Review.countDocuments(filter)
    ]);

    return sendResponse({
        res,
        message: "Reviews fetched successfully",
        data: {
            reviews,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total
            }
        }
    });
});
