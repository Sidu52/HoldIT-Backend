import mongoose from "mongoose";
import SupportTicket from "../models/SupportTicket.js";
import Booking from "../models/Booking.js";
import Store from "../models/Store.js";
import Driver from "../models/Driver.js";
import StoreOwner from "../models/StoreOwner.js";
import { addJobToQueue } from "../services/jobService.js";
import {
    OPEN_TICKET_STATUSES,
    SUPPORT_LIMITS,
    SUPPORT_JOB_OPTIONS,
} from "../constants/user/support.js";
import logger from "../utils/logger.js";
import { deleteByPattern } from "../constants/redis/redisOperation.js";
import { SupportKeys } from "../constants/redis/support.keys.js";
import { REQUESTER_MODEL, CHAT_TYPE } from "../utils/constants.js";

/**
 * Maps user JWT role string to model name string
 */
export const getRequesterModelFromRole = (role) => {
    switch (role?.toUpperCase()) {
        case "DRIVER":
            return REQUESTER_MODEL.DRIVER;
        case "STORE":
            return REQUESTER_MODEL.STORE;
        case "STORE_OWNER":
        case "STOREOWNER":
            return REQUESTER_MODEL.STORE_OWNER;
        case "USER":
        default:
            return REQUESTER_MODEL.USER;
    }
};

export const invalidateTicketCache = async (requesterId, ticketId = null) => {
    try {
        const promises = [deleteByPattern(SupportKeys.detail(requesterId, "*"))];
        if (ticketId) {
            promises.push(deleteByPattern(SupportKeys.detail(requesterId, ticketId)));
        }
        await Promise.all(promises);
    } catch (err) {
        logger.error("Support cache invalidation error:", err);
    }
};

export const checkOpenTicketLimit = async (requesterId, requesterModel) => {
    const count = await SupportTicket.countDocuments({
        $or: [
            { requesterId, requesterModel, status: { $in: OPEN_TICKET_STATUSES } },
            { userId: requesterId, status: { $in: OPEN_TICKET_STATUSES } },
        ],
    });

    return {
        hasReachedLimit: count >= SUPPORT_LIMITS.MAX_OPEN_TICKETS,
        currentCount: count,
    };
};

export const verifyEntityOwnership = async (bookingId, requesterId, requesterModel) => {
    if (!bookingId) return { valid: true, booking: null };

    const isObjectId = mongoose.Types.ObjectId.isValid(bookingId) && String(new mongoose.Types.ObjectId(bookingId)) === String(bookingId);
    let query = isObjectId ? { _id: bookingId } : { bookingCode: String(bookingId).trim().toUpperCase() };

    if (requesterModel === REQUESTER_MODEL.USER) {
        query.userId = requesterId;
    } else if (requesterModel === REQUESTER_MODEL.DRIVER) {
        query.$or = [
            { "pickup.assignment.driverId": requesterId },
            { "delivery.assignment.driverId": requesterId },
        ];
    } else if (requesterModel === REQUESTER_MODEL.STORE) {
        query.storeId = requesterId;
    }

    const booking = await Booking.findOne(query).select("_id bookingCode status").lean();

    return {
        valid: !!booking,
        booking,
    };
};

export const findOpenTicketForBooking = async (bookingId, requesterId, requesterModel) => {
    if (!bookingId) return null;

    const filter = {
        bookingId,
        status: { $in: OPEN_TICKET_STATUSES },
        $or: [
            { requesterId, requesterModel },
            { userId: requesterId },
        ],
    };

    return SupportTicket.findOne(filter)
        .select("_id ticketCode subject status chatType isEscalatedToLive createdAt lastMessageAt")
        .lean();
};

export const canReplyToTicket = (ticket, replyableStatuses) => {
    if (!replyableStatuses.includes(ticket.status)) {
        return { canReply: false, reason: "CLOSED" };
    }

    if (ticket.messages && ticket.messages.length >= SUPPORT_LIMITS.MAX_MESSAGES_PER_TICKET) {
        return { canReply: false, reason: "MAX_MESSAGES" };
    }

    return { canReply: true, reason: null };
};

export const findRequesterTicket = async (ticketId, requesterId, requesterModel, selectFields = "") => {
    return SupportTicket.findOne({
        _id: ticketId,
        $or: [
            { requesterId, requesterModel },
            { userId: requesterId },
        ],
    })
        .select(selectFields)
        .lean();
};

export const findMutableRequesterTicket = async (ticketId, requesterId, requesterModel, selectFields = "") => {
    return SupportTicket.findOne({
        _id: ticketId,
        $or: [
            { requesterId, requesterModel },
            { userId: requesterId },
        ],
    }).select(selectFields);
};

export const buildMessage = (senderId, senderModel, message, attachments = []) => {
    return {
        senderId,
        senderModel,
        message: message.trim(),
        attachments: (attachments || []).slice(0, SUPPORT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE),
        isRead: false,
    };
};

export const buildTicketData = (requesterId, requesterModel, body, initialMessage) => {
    const isUser = requesterModel === REQUESTER_MODEL.USER;
    return {
        requesterId,
        requesterModel,
        userId: isUser ? requesterId : null,
        chatType: body.chatType || CHAT_TYPE.TICKET,
        subject: body.subject.trim(),
        category: body.category,
        priority: body.priority || undefined,
        bookingId: body.bookingId || null,
        messages: [initialMessage],
    };
};

export const getUnreadCount = (messages, requesterId) => {
    if (!messages || messages.length === 0) return 0;

    return messages.filter(
        (msg) =>
            msg.senderModel === "Admin" &&
            !msg.isRead &&
            msg.senderId.toString() !== requesterId.toString()
    ).length;
};

export const enrichTicketList = (tickets, requesterId) => {
    return tickets.map((ticket) => ({
        ...ticket,
        unreadCount: getUnreadCount(ticket.messages, requesterId),
        messages: undefined,
    }));
};

export { buildPagination } from "../utils/helper.js";

export const queueSupportJob = async (queueName, jobName, data) => {
    const jobId = `${queueName}-${data.ticketId || Date.now()}`;

    await addJobToQueue(
        queueName,
        { name: jobName, data },
        { jobId, ...SUPPORT_JOB_OPTIONS }
    ).catch((err) => logger.error(`Failed to queue ${jobName}:`, err));
};
