import mongoose from "mongoose";

export const PAYMENT_STATUS = Object.freeze({
    CREATED: "created",
    AUTHORIZED: "authorized",
    CAPTURED: "captured",
    FAILED: "failed",
    REFUNDED: "refunded",
    PARTIALLY_REFUNDED: "partially_refunded",
});

export const PAYMENT_TYPE = Object.freeze({
    ADVANCE: "advance",
    FINAL: "final",
});

const ALLOWED_STATUS_TRANSITIONS = {
    [PAYMENT_STATUS.CREATED]: [PAYMENT_STATUS.AUTHORIZED, PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.FAILED],
    [PAYMENT_STATUS.AUTHORIZED]: [PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.FAILED],
    [PAYMENT_STATUS.CAPTURED]: [PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED],
    [PAYMENT_STATUS.PARTIALLY_REFUNDED]: [PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED],
    [PAYMENT_STATUS.FAILED]: [],
    [PAYMENT_STATUS.REFUNDED]: [],
};

export function canTransitionPaymentStatus(currentStatus, targetStatus) {
    if (currentStatus === targetStatus) return true;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
    return Array.isArray(allowed) && allowed.includes(targetStatus);
}

const PaymentSchema = new mongoose.Schema(
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

        type: {
            type: String,
            enum: Object.values(PAYMENT_TYPE),
            required: true,
            index: true,
        },

        razorpayOrderId: {
            type: String,
            required: true,
            index: true,
        },
        razorpayPaymentId: {
            type: String,
            sparse: true,
            unique: true,
        },
        razorpaySignature: {
            type: String,
            select: false,
        },

        // New explicit minor units (paise)
        amountMinor: {
            type: Number,
            required: true,
            min: 0,
        },
        amountRefundedMinor: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Legacy major unit fields (Rupees) preserved for compatibility
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        amountRefunded: { type: Number, default: 0, min: 0 },
        currency: { type: String, default: "INR", maxlength: 3 },

        method: {
            type: String,
            enum: ["card", "netbanking", "wallet", "upi", "emi", null],
            default: null,
        },

        status: {
            type: String,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.CREATED,
            required: true,
            index: true,
        },

        failureReason: { type: String, maxlength: 500 },

        webhookEvents: [
            {
                event: { type: String, required: true },
                receivedAt: { type: Date, default: Date.now },
            },
        ],

        capturedAt: Date,
        refundedAt: Date,
    },
    { timestamps: true }
);

PaymentSchema.index({ bookingId: 1, status: 1 });
PaymentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Payment", PaymentSchema);