import mongoose from "mongoose";

const WebhookEventSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            enum: ["RAZORPAY"],
            default: "RAZORPAY",
        },
        eventId: {
            type: String,
            required: true,
            index: true,
        },
        eventType: {
            type: String,
            required: true,
        },
        payloadHash: String,
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payment",
            index: true,
        },
        status: {
            type: String,
            enum: ["RECEIVED", "PROCESSED", "FAILED"],
            default: "RECEIVED",
            index: true,
        },
        processedAt: Date,
        failureReason: String,
        retryCount: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export default mongoose.model("WebhookEvent", WebhookEventSchema);
