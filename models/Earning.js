import mongoose from "mongoose";

export const EARNING_RECIPIENT = Object.freeze({
    DRIVER: "DRIVER",
    STORE_OWNER: "STORE_OWNER",
});

export const EARNING_PURPOSE = Object.freeze({
    PICKUP: "PICKUP",
    STORAGE: "STORAGE",
    RETURN_DELIVERY: "RETURN_DELIVERY",
});

export const EARNING_STATUS = Object.freeze({
    PENDING: "PENDING",
    ELIGIBLE: "ELIGIBLE",
    PAYABLE: "PAYABLE",
    PAID: "PAID",
    CANCELLED: "CANCELLED",
    ADJUSTED: "ADJUSTED",
});

const EarningSchema = new mongoose.Schema(
    {
        financialEventId: {
            type: String,
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
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payment",
            index: true,
        },
        recipientType: {
            type: String,
            enum: Object.values(EARNING_RECIPIENT),
            required: true,
            index: true,
        },
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            index: true,
            default: null,
        },
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            index: true,
            default: null,
        },
        purpose: {
            type: String,
            enum: Object.values(EARNING_PURPOSE),
            required: true,
            index: true,
        },
        grossAmountMinor: {
            type: Number,
            required: true,
            min: 0,
        },
        commissionAmountMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        taxDeductionMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        netEarningMinor: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: Object.values(EARNING_STATUS),
            default: EARNING_STATUS.PENDING,
            index: true,
        },
        eligibleAt: Date,
        payableAt: Date,
        paidAt: Date,
        payoutId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payout",
            default: null,
        },
    },
    { timestamps: true }
);

EarningSchema.index({ bookingId: 1, purpose: 1 });
EarningSchema.index({ recipientId: 1, status: 1 });

export default mongoose.model("Earning", EarningSchema);
