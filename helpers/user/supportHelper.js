import SupportTicket from "../../models/SupportTicket.js";
import Booking from "../../models/Booking.js";
// import { get, set, del, delByPattern } from "../../services/redisService.js";
import { addJobToQueue } from "../../services/jobService.js";
import {
    OPEN_TICKET_STATUSES,
    SUPPORT_LIMITS,
    SUPPORT_JOB_OPTIONS,
} from "../../constants/user/support.js";
import logger from "../../utils/logger.js";
import { deleteByPattern } from "../../constants/redis/redisOperation.js";
import { SupportKeys } from "../../constants/redis/support.keys.js";




export const invalidateTicketCache = async (userId, ticketId = null) => {
    try {
        const promises = [deleteByPattern(SupportKeys.detail(userId, "*"))];
        if (ticketId) {
            promises.push(deleteByPattern(SupportKeys.detail(userId, ticketId)));
        }
        await Promise.all(promises);
    } catch (err) {
        logger.error("Support cache invalidation error:", err);
    }
};

export const checkOpenTicketLimit = async (userId) => {
    const count = await SupportTicket.countDocuments({
        userId,
        status: { $in: OPEN_TICKET_STATUSES },
    });

    return {
        hasReachedLimit: count >= SUPPORT_LIMITS.MAX_OPEN_TICKETS,
        currentCount: count,
    };
};


export const verifyBookingOwnership = async (bookingId, userId) => {
    if (!bookingId) return { valid: true, booking: null };

    const booking = await Booking.findOne({
        _id: bookingId,
        userId,
    })
        .select("_id bookingCode status")
        .lean();

    return {
        valid: !!booking,
        booking,
    };
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


export const findUserTicket = async (ticketId, userId, selectFields = "") => {
    return SupportTicket.findOne({
        _id: ticketId,
        userId,
    })
        .select(selectFields)
        .lean();
};


export const findMutableUserTicket = async (ticketId, userId, selectFields = "") => {
    return SupportTicket.findOne({
        _id: ticketId,
        userId,
    }).select(selectFields);
};


export const buildMessage = (senderId, senderModel, message, attachments = []) => {
    return {
        senderId,
        senderModel,
        message: message.trim(),
        attachments: attachments.slice(0, SUPPORT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE),
        isRead: false,
    };
};


export const buildTicketData = (userId, body, initialMessage) => {
    return {
        userId,
        subject: body.subject.trim(),
        category: body.category,
        priority: body.priority || undefined,
        bookingId: body.bookingId || null,
        messages: [initialMessage],
    };
};

export const getUnreadCount = (messages, userId) => {
    if (!messages || messages.length === 0) return 0;

    return messages.filter(
        (msg) =>
            msg.senderModel === "Admin" &&
            !msg.isRead &&
            msg.senderId.toString() !== userId.toString()
    ).length;
};

export const enrichTicketList = (tickets, userId) => {
    return tickets.map((ticket) => ({
        ...ticket,
        unreadCount: getUnreadCount(ticket.messages, userId),
        messages: undefined,
    }));
};


export { buildPagination } from "../../utils/helper.js";

export const queueSupportJob = async (queueName, jobName, data) => {
    const jobId = `${queueName}-${data.ticketId || Date.now()}`;

    await addJobToQueue(
        queueName,
        { name: jobName, data },
        { jobId, ...SUPPORT_JOB_OPTIONS }
    ).catch((err) => logger.error(`Failed to queue ${jobName}:`, err));
};