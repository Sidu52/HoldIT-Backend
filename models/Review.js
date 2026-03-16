import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            index: true,
        },
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            index: true,
        },
        reviewType: {
            type: String,
            enum: ["DRIVER", "STORE", "SERVICE"],
            required: true,
            index: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            trim: true,
            maxlength: 1000,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    { timestamps: true }
);

// Prevent duplicate reviews per booking per type
ReviewSchema.index(
    { bookingId: 1, userId: 1, reviewType: 1 },
    { unique: true }
);

// For driver review aggregation
ReviewSchema.index({ driverId: 1, is_active: 1, createdAt: -1 });

// For store review aggregation
ReviewSchema.index({ storeId: 1, is_active: 1, createdAt: -1 });

const Review = mongoose.model("Review", ReviewSchema);
export default Review;