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
 * @desc Create a review for a Driver or Store
 * @route POST /api/v1/user/reviews
 * @access Private (User)
 */
export const createReview = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;
    const { bookingId, rating, comment, reviewType } = req.body;

    if (!bookingId || !rating || !reviewType) {
        return sendError(res, "Booking ID, rating, and review type are required", STATUS_CODES.BAD_REQUEST);
    }

    if (!["DRIVER", "STORE"].includes(reviewType)) {
        return sendError(res, "Invalid review type. Must be DRIVER or STORE", STATUS_CODES.BAD_REQUEST);
    }

    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
        return sendError(res, "Booking not found", STATUS_CODES.NOT_FOUND);
    }

    if (booking.status !== BOOKING_STATUS.DELIVERED) {
        return sendError(res, "Reviews can only be given for delivered bookings", STATUS_CODES.BAD_REQUEST);
    }

    const targetId = reviewType === "DRIVER" 
        ? (booking.delivery?.assignment?.driverId || booking.pickup?.assignment?.driverId)
        : booking.storeId;

    if (!targetId) {
        return sendError(res, `${reviewType} not found in this booking`, STATUS_CODES.BAD_REQUEST);
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ bookingId, userId, reviewType });
    if (existingReview) {
        return sendError(res, `You have already reviewed this ${reviewType.toLowerCase()}`, STATUS_CODES.CONFLICT);
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const review = await Review.create([{
            bookingId,
            userId,
            driverId: reviewType === "DRIVER" ? targetId : null,
            storeId: reviewType === "STORE" ? targetId : null,
            reviewType,
            rating,
            comment
        }], { session });

        // Update denormalized ratings
        if (reviewType === "DRIVER") {
            const driver = await Driver.findById(targetId).session(session);
            if (driver) {
                const totalRating = (driver.rating_avg * driver.rating_count) + rating;
                driver.rating_count += 1;
                driver.rating_avg = parseFloat((totalRating / driver.rating_count).toFixed(2));
                await driver.save({ session });
            }
        } else {
            const store = await Store.findById(targetId).session(session);
            if (store) {
                const totalRating = (store.rating_avg * store.rating_count) + rating;
                store.rating_count += 1;
                store.rating_avg = parseFloat((totalRating / store.rating_count).toFixed(2));
                await store.save({ session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        return sendResponse({
            res,
            message: "Review submitted successfully",
            data: review[0]
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
    const { driverId, storeId, page = 1, limit = 10 } = req.query;

    const filter = { is_active: true };
    if (driverId) filter.driverId = driverId;
    if (storeId) filter.storeId = storeId;

    if (!driverId && !storeId) {
        return sendError(res, "Driver ID or Store ID is required", STATUS_CODES.BAD_REQUEST);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
        Review.find(filter)
            .populate("userId", "first_name last_name")
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
