import mongoose from "mongoose";
import crypto from "crypto";
import { TICKET_STATUS, TICKET_PRIORITY, TICKET_CATEGORY, CHAT_TYPE, REQUESTER_MODEL, SENDER_MODEL } from "../utils/constants.js";

const MessageSchema = new mongoose.Schema(
    {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "messages.senderModel",
        },
        senderModel: {
            type: String,
            required: true,
            enum: Object.values(SENDER_MODEL),
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        attachments: [
            {
                url: { type: String, maxlength: 500 },
                fileName: { type: String, maxlength: 200 },
                fileType: { type: String, maxlength: 50 },
            },
        ],
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

const SupportTicketSchema = new mongoose.Schema(
    {
        ticketCode: {
            type: String,
            unique: true,
        },
        requesterId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "requesterModel",
            required: true,
            index: true,
        },
        requesterModel: {
            type: String,
            required: true,
            enum: Object.values(REQUESTER_MODEL),
            default: REQUESTER_MODEL.USER,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
            default: null,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            index: true,
            default: null,
        },
        chatType: {
            type: String,
            enum: Object.values(CHAT_TYPE),
            default: CHAT_TYPE.TICKET,
            index: true,
        },
        isEscalatedToLive: {
            type: Boolean,
            default: false,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300,
        },
        category: {
            type: String,
            required: true,
            enum: Object.values(TICKET_CATEGORY),
            index: true,
        },
        priority: {
            type: String,
            enum: Object.values(TICKET_PRIORITY),
            default: TICKET_PRIORITY.MEDIUM,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(TICKET_STATUS),
            default: TICKET_STATUS.OPEN,
            index: true,
        },
        messages: [MessageSchema],
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            index: true,
            default: null,
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        lastMessageBy: {
            type: String,
            enum: Object.values(SENDER_MODEL),
            default: SENDER_MODEL.USER,
        },
        resolvedAt: {
            type: Date,
        },
        closedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Auto-generate ticket code
SupportTicketSchema.pre("save", function () {
    if (!this.ticketCode) {
        const prefix = this.chatType === CHAT_TYPE.BOT_CHAT ? "BOT-" : (this.chatType === CHAT_TYPE.LIVE_CHAT ? "CHAT-" : "TKT-");
        this.ticketCode =
            prefix +
            Date.now().toString(36).toUpperCase() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();
    }
});

// Update lastMessageAt on new message push
SupportTicketSchema.pre("save", function () {
    if (this.isModified("messages") && this.messages.length > 0) {
        const lastMsg = this.messages[this.messages.length - 1];
        this.lastMessageAt = lastMsg.createdAt || new Date();
        this.lastMessageBy = lastMsg.senderModel;
    }
});

// Indexes
SupportTicketSchema.index({ requesterId: 1, requesterModel: 1, status: 1, createdAt: -1 });
SupportTicketSchema.index({ userId: 1, status: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, priority: 1, lastMessageAt: -1 });
SupportTicketSchema.index({ assignedTo: 1, status: 1 });
SupportTicketSchema.index({ ticketCode: 1 });

const SupportTicket = mongoose.model("SupportTicket", SupportTicketSchema);
export default SupportTicket;