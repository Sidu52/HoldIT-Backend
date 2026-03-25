import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, TICKET_STATUS } from "../../utils/constants.js";
import SupportTicket from "../../models/SupportTicket.js";
import {
    SUPPORT_CACHE,
    SUPPORT_LIMITS,
    REPLYABLE_STATUSES,
    SUPPORT_SELECT,
    SUPPORT_QUEUES,
    SUPPORT_JOB_NAMES,
    SUPPORT_MESSAGES,
} from "../../constants/user/support.js";
import {
    getCachedData,
    setCacheData,
    invalidateTicketCache,
    checkOpenTicketLimit,
    verifyBookingOwnership,
    canReplyToTicket,
    findUserTicket,
    findMutableUserTicket,
    buildMessage,
    buildTicketData,
    enrichTicketList,
    buildPagination,
    queueSupportJob,
} from "../../helpers/user/supportHelper.js";
import logger from "../../utils/logger.js";


export const createTicket = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { subject, category, priority, message, bookingId, attachments } = req.body;

        // Check open ticket limit
        const { hasReachedLimit } = await checkOpenTicketLimit(userId);

        if (hasReachedLimit) {
            return sendError(
                res,
                SUPPORT_MESSAGES.MAX_OPEN_REACHED(SUPPORT_LIMITS.MAX_OPEN_TICKETS),
                STATUS_CODES.CONFLICT
            );
        }

        // Verify booking ownership
        if (bookingId) {
            const { valid } = await verifyBookingOwnership(bookingId, userId);

            if (!valid) {
                return sendError(
                    res,
                    SUPPORT_MESSAGES.BOOKING_NOT_FOUND,
                    STATUS_CODES.NOT_FOUND
                );
            }
        }

        // Build initial message
        const initialMessage = buildMessage(
            userId,
            "User",
            message,
            attachments || []
        );

        // Build & create ticket
        const ticketData = buildTicketData(userId, {
            subject,
            category,
            priority,
            bookingId,
        }, initialMessage);

        const ticket = await SupportTicket.create(ticketData);
        await invalidateTicketCache(userId);

        queueSupportJob(
            SUPPORT_QUEUES.TICKET_CREATED,
            SUPPORT_JOB_NAMES.TICKET_CREATED,
            {
                ticketId: ticket._id.toString(),
                ticketCode: ticket.ticketCode,
                userId,
                category,
                priority: ticket.priority,
                subject,
            }
        );

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: SUPPORT_MESSAGES.TICKET_CREATED,
            data: {
                ticketId: ticket._id,
                ticketCode: ticket.ticketCode,
                status: ticket.status,
                priority: ticket.priority,
                category: ticket.category,
                createdAt: ticket.createdAt,
            },
        });
    } catch (err) {
        logger.error("Create Ticket Error:", err);
        return sendError(res, SUPPORT_MESSAGES.CREATE_FAILED);
    }
};

export const getUserTickets = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const {
            page = 1,
            limit = 10,
            status,
            sort_order = "desc",
        } = req.validated?.query || req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;
        const cacheKey = SUPPORT_CACHE.LIST_KEY(userId, pageNum, limitNum, status);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: SUPPORT_MESSAGES.TICKETS_FETCHED,
                data: cached,
            });
        }

        const filter = { userId };
        if (status) filter.status = status;

        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter)
                .select(SUPPORT_SELECT.LIST + " messages.senderModel messages.isRead messages.senderId")
                .sort({ lastMessageAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            SupportTicket.countDocuments(filter),
        ]);

        const enrichedTickets = enrichTicketList(tickets, userId);

        const responseData = {
            tickets: enrichedTickets,
            pagination: buildPagination(pageNum, limitNum, total),
        };
        await setCacheData(cacheKey, responseData, SUPPORT_CACHE.LIST_TTL);

        return sendResponse({
            res,
            message: SUPPORT_MESSAGES.TICKETS_FETCHED,
            data: responseData,
        });
    } catch (err) {
        logger.error("Get User Tickets Error:", err);
        return sendError(res, SUPPORT_MESSAGES.FETCH_FAILED);
    }
};


export const getTicketById = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { id } = req.params;
        const cacheKey = SUPPORT_CACHE.DETAIL_KEY(userId, id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: SUPPORT_MESSAGES.TICKET_FETCHED,
                data: cached,
            });
        }
        const ticket = await findUserTicket(id, userId, SUPPORT_SELECT.DETAIL);

        if (!ticket) {
            return sendError(
                res,
                SUPPORT_MESSAGES.TICKET_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        markAdminMessagesAsRead(id, userId);
        await setCacheData(cacheKey, ticket, SUPPORT_CACHE.DETAIL_TTL);

        return sendResponse({
            res,
            message: SUPPORT_MESSAGES.TICKET_FETCHED,
            data: ticket,
        });
    } catch (err) {
        logger.error("Get Ticket By ID Error:", err);
        return sendError(res, SUPPORT_MESSAGES.DETAIL_FAILED);
    }
};


const markAdminMessagesAsRead = (ticketId, userId) => {
    SupportTicket.updateOne(
        { _id: ticketId, userId },
        {
            $set: {
                "messages.$[msg].isRead": true,
                "messages.$[msg].readAt": new Date(),
            },
        },
        {
            arrayFilters: [
                {
                    "msg.senderModel": "Admin",
                    "msg.isRead": false,
                },
            ],
        }
    ).catch((err) => logger.error("Mark messages read error:", err));
};

export const replyToTicket = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { id } = req.params;
        const { message, attachments } = req.body;
        const ticket = await findMutableUserTicket(id, userId, "status messages");

        if (!ticket) {
            return sendError(
                res,
                SUPPORT_MESSAGES.TICKET_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        // Check if ticket accepts replies
        const { canReply, reason } = canReplyToTicket(ticket, REPLYABLE_STATUSES);

        if (!canReply) {
            if (reason === "CLOSED") {
                return sendError(
                    res,
                    SUPPORT_MESSAGES.TICKET_CLOSED,
                    STATUS_CODES.CONFLICT
                );
            }
            if (reason === "MAX_MESSAGES") {
                return sendError(
                    res,
                    SUPPORT_MESSAGES.MAX_MESSAGES_REACHED(SUPPORT_LIMITS.MAX_MESSAGES_PER_TICKET),
                    STATUS_CODES.CONFLICT
                );
            }
        }

        //  Build & push message
        const newMessage = buildMessage(
            userId,
            "User",
            message,
            attachments || []
        );

        ticket.messages.push(newMessage);

        if (ticket.status === TICKET_STATUS.AWAITING_USER) {
            ticket.status = TICKET_STATUS.AWAITING_ADMIN;
        }

        await ticket.save();
        await invalidateTicketCache(userId, id);

        // Queue notification for admin
        queueSupportJob(
            SUPPORT_QUEUES.TICKET_REPLY,
            SUPPORT_JOB_NAMES.NEW_USER_REPLY,
            {
                ticketId: id,
                ticketCode: ticket.ticketCode,
                userId,
                messagePreview: message.substring(0, 100),
            }
        );

        // Get the saved message
        const savedMessage = ticket.messages[ticket.messages.length - 1];

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: SUPPORT_MESSAGES.REPLY_SENT,
            data: {
                ticketId: ticket._id,
                status: ticket.status,
                message: {
                    id: savedMessage._id,
                    message: savedMessage.message,
                    attachments: savedMessage.attachments,
                    createdAt: savedMessage.createdAt,
                },
                totalMessages: ticket.messages.length,
            },
        });
    } catch (err) {
        logger.error("Reply To Ticket Error:", err);
        return sendError(res, SUPPORT_MESSAGES.REPLY_FAILED);
    }
};