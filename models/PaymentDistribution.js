import mongoose from "mongoose";

export const RECIPIENT_TYPE = Object.freeze({
    DRIVER: "DRIVER",
    STORE_OWNER: "STORE_OWNER",
});

export const DISTRIBUTION_PURPOSE = Object.freeze({
    PICKUP: "PICKUP",
    STORAGE: "STORAGE",
    RETURN_DELIVERY: "RETURN_DELIVERY",
});

const PaymentDistributionSchema = new mongoose.Schema(
    {
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payment",
            required: true,
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
            enum: Object.values(RECIPIENT_TYPE),
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
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        purpose: {
            type: String,
            enum: Object.values(DISTRIBUTION_PURPOSE),
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "SETTLED", "DISBURSED"],
            default: "PENDING",
            index: true,
        },
        disbursedAt: Date,
    },
    { timestamps: true }
);

PaymentDistributionSchema.index({ bookingId: 1, purpose: 1 });
PaymentDistributionSchema.index({ recipientId: 1, recipientType: 1, status: 1 });

const PaymentDistribution = mongoose.model("PaymentDistribution", PaymentDistributionSchema);
export default PaymentDistribution;
