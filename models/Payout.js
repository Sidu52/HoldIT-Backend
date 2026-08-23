import mongoose from "mongoose";

export const PAYOUT_STATUS = Object.freeze({
    PENDING: "PENDING",
    TRANSFER_INITIATED: "TRANSFER_INITIATED",
    DISBURSED: "DISBURSED",
    TRANSFER_FAILED: "TRANSFER_FAILED",
    CANCELLED: "CANCELLED",
});

const PayoutSchema = new mongoose.Schema(
    {
        earningId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Earning",
            required: true,
            unique: true,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            index: true,
        },
        recipientType: {
            type: String,
            enum: ["DRIVER", "STORE_OWNER"],
            required: true,
            index: true,
        },
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        amountMinor: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "INR",
            maxlength: 3,
        },
        status: {
            type: String,
            enum: Object.values(PAYOUT_STATUS),
            default: PAYOUT_STATUS.PENDING,
            index: true,
        },
        provider: {
            type: String,
            default: "RAZORPAY_ROUTE",
        },
        providerTransferId: {
            type: String,
            sparse: true,
            index: true,
        },
        initiatedAt: Date,
        completedAt: Date,
        failureReason: String,
        retryCount: {
            type: Number,
            default: 0,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

PayoutSchema.index({ recipientId: 1, status: 1 });

export default mongoose.model("Payout", PayoutSchema);
