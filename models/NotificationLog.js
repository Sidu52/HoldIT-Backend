import mongoose from "mongoose";

const NotificationLogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        targetAudience: {
            type: String,
            required: true,
            enum: [
                "ALL_USERS",
                "ALL_DRIVERS",
                "ALL_ONLINE_DRIVERS",
                "ALL_ACTIVE_USERS",
                "SPECIFIC_USER",
                "SPECIFIC_DRIVER",
                "BROADCAST_ALL",
            ],
            index: true,
        },
        targetRecipientId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        targetRecipientName: {
            type: String,
            default: null,
        },
        screen: {
            type: String,
            default: "home",
        },
        customData: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        recipientCount: {
            type: Number,
            default: 0,
        },
        successCount: {
            type: Number,
            default: 0,
        },
        failureCount: {
            type: Number,
            default: 0,
        },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
            index: true,
        },
        sentByName: {
            type: String,
            required: true,
        },
        sentByRole: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["COMPLETED", "FAILED", "PARTIAL"],
            default: "COMPLETED",
            index: true,
        },
    },
    { timestamps: true }
);

NotificationLogSchema.index({ createdAt: -1 });

const NotificationLog = mongoose.model("NotificationLog", NotificationLogSchema);
export default NotificationLog;
