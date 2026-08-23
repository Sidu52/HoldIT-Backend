import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, TICKET_STATUS, CHAT_TYPE, SENDER_MODEL } from "../../utils/constants.js";
import SupportTicket from "../../models/SupportTicket.js";
import {
    SUPPORT_LIMITS,
    REPLYABLE_STATUSES,
    SUPPORT_SELECT,
    SUPPORT_QUEUES,
    SUPPORT_JOB_NAMES,
    SUPPORT_MESSAGES,
} from "../../constants/user/support.js";
import {
    getRequesterModelFromRole,
    invalidateTicketCache,
    checkOpenTicketLimit,
    verifyEntityOwnership,
    findOpenTicketForBooking,
    canReplyToTicket,
    findRequesterTicket,
    findMutableRequesterTicket,
    buildMessage,
    buildTicketData,
    enrichTicketList,
    buildPagination,
    queueSupportJob,
} from "../../helpers/supportHelper.js";
import { botSupportService } from "../../services/botSupportService.js";
import logger from "../../utils/logger.js";
import { getCache, setCache } from "../../constants/redis/redisOperation.js";
import { SupportKeys, SupportTTL } from "../../constants/redis/support.keys.js";
import { getIO } from "../../src/socket/index.js";
import { rooms } from "../../src/socket/socket.rooms.js";
import { SOCKET_EVENTS } from "../../src/socket/socket.events.js";

/**
 * Safely get IO instance without throwing
 */
const safeGetIO = () => {
    try {
        return getIO();
    } catch {
        return null;
    }
};

/**
 * Universal Create Support Ticket / Bot Chat / Live Chat
 */
export const createTicket = async (req, res) => {
    try {
        const requesterId = req.user.auth_id;
        const requesterModel = getRequesterModelFromRole(req.user.role);
        const {
            subject,
            category = "other",
            priority = "medium",
            bookingId,
            attachments,
        } = req.body;

        const effectiveMessage = req.body.message || req.body.initialMessage || "";
        let normalizedChatType = CHAT_TYPE.TICKET;
        const rawChatType = String(req.body.chatType || "").toUpperCase();
        if (rawChatType === "BOT_CHAT" || rawChatType === "AI_BOT") {
            normalizedChatType = CHAT_TYPE.BOT_CHAT;
        } else if (rawChatType === "LIVE_CHAT" || rawChatType === "LIVE_AGENT") {
            normalizedChatType = CHAT_TYPE.LIVE_CHAT;
        }

        // Check open ticket limit
        const { hasReachedLimit } = await checkOpenTicketLimit(requesterId, requesterModel);
        if (hasReachedLimit) {
            return sendError(
                res,
                SUPPORT_MESSAGES.MAX_OPEN_REACHED(SUPPORT_LIMITS.MAX_OPEN_TICKETS),
                STATUS_CODES.CONFLICT
            );
        }

        // Verify entity ownership if booking referenced
        let resolvedBookingId = undefined;
        if (bookingId && typeof bookingId === "string" && bookingId.trim()) {
            const { valid, booking } = await verifyEntityOwnership(bookingId.trim(), requesterId, requesterModel);
            if (!valid) {
                return sendError(res, SUPPORT_MESSAGES.BOOKING_NOT_FOUND, STATUS_CODES.NOT_FOUND);
            }
            if (booking) {
                resolvedBookingId = booking._id;

                // Enforce: ONLY 1 active/in-progress ticket allowed per booking for this requester
                const existingTicket = await findOpenTicketForBooking(
                    resolvedBookingId,
                    requesterId,
                    requesterModel
                );

                if (existingTicket) {
                    return sendError(
                        res,
                        `A support ticket (#${existingTicket.ticketCode || existingTicket._id}) is already open for this booking. Only 1 active ticket is allowed per booking.`,
                        STATUS_CODES.CONFLICT,
                        {
                            existingTicketId: existingTicket._id,
                            ticketCode: existingTicket.ticketCode,
                            status: existingTicket.status,
                        }
                    );
                }
            }
        }

        // Build initial requester message
        const initialMessage = buildMessage(
            requesterId,
            requesterModel,
            effectiveMessage,
            attachments || []
        );

        // Build & create ticket/chat record
        const ticketData = buildTicketData(
            requesterId,
            requesterModel,
            {
                subject,
                category,
                priority,
                bookingId: resolvedBookingId,
                chatType: normalizedChatType,
            },
            initialMessage
        );

        const ticket = await SupportTicket.create(ticketData);

        // Check for Bot Chat Automated Response
        let botResponseMsg = null;
        if (normalizedChatType === CHAT_TYPE.BOT_CHAT || normalizedChatType === CHAT_TYPE.TICKET) {
            const shouldEscalate = botSupportService.shouldEscalate(effectiveMessage);

            if (shouldEscalate) {
                ticket.chatType = CHAT_TYPE.LIVE_CHAT;
                ticket.isEscalatedToLive = true;
                ticket.status = TICKET_STATUS.OPEN;

                const botMsg = {
                    senderId: ticket._id,
                    senderModel: SENDER_MODEL.BOT,
                    message: "I am transferring you to a live support agent right now. An agent will join this chat shortly.",
                    isRead: false,
                    createdAt: new Date(),
                };
                ticket.messages.push(botMsg);
                await ticket.save();

                // Notify admin support room via socket
                const io = safeGetIO();
                if (io) {
                    io.to(rooms.adminSupport()).emit(SOCKET_EVENTS.SUPPORT_TICKET_ESCALATED, {
                        ticketId: ticket._id,
                        ticketCode: ticket.ticketCode,
                        requesterId,
                        requesterModel,
                        subject: ticket.subject,
                    });
                }
            } else if (ticket.chatType === CHAT_TYPE.BOT_CHAT) {
                const botResult = botSupportService.generateBotResponse(requesterModel, message);
                const botMsg = {
                    senderId: ticket._id,
                    senderModel: SENDER_MODEL.BOT,
                    message: botResult.message,
                    isRead: false,
                    createdAt: new Date(),
                };
                ticket.messages.push(botMsg);
                ticket.status = TICKET_STATUS.AWAITING_USER;
                await ticket.save();
                botResponseMsg = botMsg;
            }
        }

        await invalidateTicketCache(requesterId);

        const io = safeGetIO();
        if (io) {
            io.to(rooms.adminSupport()).emit(SOCKET_EVENTS.SUPPORT_TICKET_CREATED, {
                ticketId: ticket._id,
                ticketCode: ticket.ticketCode,
                requesterId,
                requesterModel,
                subject: ticket.subject,
                category: ticket.category,
                priority: ticket.priority,
                status: ticket.status,
                createdAt: ticket.createdAt,
            });
        }

        queueSupportJob(
            SUPPORT_QUEUES.TICKET_CREATED,
            SUPPORT_JOB_NAMES.TICKET_CREATED,
            {
                ticketId: ticket._id.toString(),
                ticketCode: ticket.ticketCode,
                requesterId,
                requesterModel,
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
                chatType: ticket.chatType,
                isEscalatedToLive: ticket.isEscalatedToLive,
                status: ticket.status,
                priority: ticket.priority,
                category: ticket.category,
                messages: ticket.messages,
                createdAt: ticket.createdAt,
            },
        });
    } catch (err) {
        logger.error("Create Ticket / Chat Error:", err);
        return sendError(res, SUPPORT_MESSAGES.CREATE_FAILED);
    }
};

/**
 * Universal Get Tickets / Chats List
 */
export const getUserTickets = async (req, res) => {
    try {
        const requesterId = req.user.auth_id;
        const requesterModel = getRequesterModelFromRole(req.user.role);
        const {
            page = 1,
            limit = 10,
            status,
            chatType,
            sort_order = "desc",
        } = req.validated?.query || req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;
        const cacheKey = SupportKeys.list(`${requesterModel}:${requesterId}`, pageNum, limitNum, status);
        const cached = await getCache(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: SUPPORT_MESSAGES.TICKETS_FETCHED,
                data: cached,
            });
        }

        const filter = {
            $or: [
                { requesterId, requesterModel },
                { userId: requesterId },
            ],
        };
        if (status) filter.status = status;
        if (chatType) filter.chatType = chatType;

        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter)
                .select(SUPPORT_SELECT.LIST + " chatType isEscalatedToLive messages.senderModel messages.isRead messages.senderId")
                .populate("bookingId", "bookingCode status pickupLocation deliveryLocation storageLocation")
                .populate("assignedTo", "first_name last_name email")
                .sort({ lastMessageAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            SupportTicket.countDocuments(filter),
        ]);

        const enrichedTickets = enrichTicketList(tickets, requesterId);

        const responseData = {
            tickets: enrichedTickets,
            pagination: buildPagination(pageNum, limitNum, total),
        };
        await setCache(cacheKey, responseData, SupportTTL.LIST);

        return sendResponse({
            res,
            message: SUPPORT_MESSAGES.TICKETS_FETCHED,
            data: responseData,
        });
    } catch (err) {
        logger.error("Get Tickets Error:", err);
        return sendError(res, SUPPORT_MESSAGES.FETCH_FAILED);
    }
};

/**
 * Universal Get Ticket Details by ID
 */
export const getTicketById = async (req, res) => {
    try {
        const requesterId = req.user.auth_id;
        const requesterModel = getRequesterModelFromRole(req.user.role);
        const { id } = req.params;
        const cacheKey = SupportKeys.detail(requesterId, id);
        const cached = await getCache(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: SUPPORT_MESSAGES.TICKET_FETCHED,
                data: cached,
            });
        }

        const ticket = await findRequesterTicket(id, requesterId, requesterModel, SUPPORT_SELECT.DETAIL);

        if (!ticket) {
            return sendError(
                res,
                SUPPORT_MESSAGES.TICKET_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        markOppositeMessagesAsRead(id, requesterId, requesterModel);
        await setCache(cacheKey, ticket, SupportTTL.DETAIL);

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

const markOppositeMessagesAsRead = (ticketId, requesterId, requesterModel) => {
    SupportTicket.updateOne(
        {
            _id: ticketId,
            $or: [{ requesterId, requesterModel }, { userId: requesterId }],
        },
        {
            $set: {
                "messages.$[msg].isRead": true,
                "messages.$[msg].readAt": new Date(),
            },
        },
        {
            arrayFilters: [
                {
                    "msg.senderModel": { $in: ["Admin", "Bot"] },
                    "msg.isRead": false,
                },
            ],
        }
    ).catch((err) => logger.error("Mark messages read error:", err));
};

/**
 * Universal Reply to Ticket / Send Message
 */
export const replyToTicket = async (req, res) => {
    try {
        const requesterId = req.user.auth_id;
        const requesterModel = getRequesterModelFromRole(req.user.role);
        const { id } = req.params;
        const { message, attachments } = req.body;
        const ticket = await findMutableRequesterTicket(id, requesterId, requesterModel, "status chatType isEscalatedToLive messages subject ticketCode");

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
                return sendError(res, SUPPORT_MESSAGES.TICKET_CLOSED, STATUS_CODES.CONFLICT);
            }
            if (reason === "MAX_MESSAGES") {
                return sendError(
                    res,
                    SUPPORT_MESSAGES.MAX_MESSAGES_REACHED(SUPPORT_LIMITS.MAX_MESSAGES_PER_TICKET),
                    STATUS_CODES.CONFLICT
                );
            }
        }

        // Build & push new requester message
        const newMessage = buildMessage(
            requesterId,
            requesterModel,
            message,
            attachments || []
        );
        ticket.messages.push(newMessage);

        if (ticket.status === TICKET_STATUS.AWAITING_USER) {
            ticket.status = TICKET_STATUS.AWAITING_ADMIN;
        }

        // Handle Bot Chat auto-response or escalation trigger
        if (ticket.chatType === CHAT_TYPE.BOT_CHAT && !ticket.isEscalatedToLive) {
            const shouldEscalate = botSupportService.shouldEscalate(message);

            if (shouldEscalate) {
                ticket.chatType = CHAT_TYPE.LIVE_CHAT;
                ticket.isEscalatedToLive = true;
                ticket.status = TICKET_STATUS.OPEN;

                const botMsg = {
                    senderId: ticket._id,
                    senderModel: SENDER_MODEL.BOT,
                    message: "I am transferring you to a live support agent right now. An agent will join this chat shortly.",
                    isRead: false,
                    createdAt: new Date(),
                };
                ticket.messages.push(botMsg);

                // Notify admin support room via socket
                const io = safeGetIO();
                if (io) {
                    io.to(rooms.adminSupport()).emit(SOCKET_EVENTS.SUPPORT_TICKET_ESCALATED, {
                        ticketId: ticket._id,
                        ticketCode: ticket.ticketCode,
                        requesterId,
                        requesterModel,
                        subject: ticket.subject,
                    });
                }
            } else {
                const botResult = botSupportService.generateBotResponse(requesterModel, message);
                const botMsg = {
                    senderId: ticket._id,
                    senderModel: SENDER_MODEL.BOT,
                    message: botResult.message,
                    isRead: false,
                    createdAt: new Date(),
                };
                ticket.messages.push(botMsg);
                ticket.status = TICKET_STATUS.AWAITING_USER;
            }
        }

        await ticket.save();
        await invalidateTicketCache(requesterId, id);

        // Broadcast real-time message to socket room
        const io = safeGetIO();
        if (io) {
            const latestMsg = ticket.messages[ticket.messages.length - 1];
            io.to(rooms.supportTicket(id.toString())).emit(SOCKET_EVENTS.SUPPORT_NEW_MESSAGE, {
                ticketId: id,
                message: latestMsg,
                status: ticket.status,
            });

            io.to(rooms.adminSupport()).emit(SOCKET_EVENTS.SUPPORT_NEW_MESSAGE, {
                ticketId: id,
                ticketCode: ticket.ticketCode,
                requesterId,
                requesterModel,
                message: latestMsg,
                messagePreview: message.substring(0, 100),
                status: ticket.status,
            });
        }

        queueSupportJob(
            SUPPORT_QUEUES.TICKET_REPLY,
            SUPPORT_JOB_NAMES.NEW_USER_REPLY,
            {
                ticketId: id,
                ticketCode: ticket.ticketCode,
                requesterId,
                requesterModel,
                messagePreview: message.substring(0, 100),
            }
        );

        const savedMessage = ticket.messages[ticket.messages.length - 1];

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: SUPPORT_MESSAGES.REPLY_SENT,
            data: {
                ticketId: ticket._id,
                status: ticket.status,
                chatType: ticket.chatType,
                isEscalatedToLive: ticket.isEscalatedToLive,
                message: savedMessage,
                totalMessages: ticket.messages.length,
            },
        });
    } catch (err) {
        logger.error("Reply To Ticket Error:", err);
        return sendError(res, SUPPORT_MESSAGES.REPLY_FAILED);
    }
};

/**
 * Universal Escalate Ticket / Bot Chat to Live Chat Agent
 */
export const escalateToLive = async (req, res) => {
    try {
        const requesterId = req.user.auth_id;
        const requesterModel = getRequesterModelFromRole(req.user.role);
        const { id } = req.params;

        const ticket = await findMutableRequesterTicket(id, requesterId, requesterModel, "status chatType isEscalatedToLive messages subject ticketCode");
        if (!ticket) {
            return sendError(res, SUPPORT_MESSAGES.TICKET_NOT_FOUND, STATUS_CODES.NOT_FOUND);
        }

        if (ticket.status === TICKET_STATUS.CLOSED || ticket.status === TICKET_STATUS.RESOLVED) {
            return sendError(res, SUPPORT_MESSAGES.TICKET_CLOSED, STATUS_CODES.CONFLICT);
        }

        ticket.chatType = CHAT_TYPE.LIVE_CHAT;
        ticket.isEscalatedToLive = true;
        ticket.status = TICKET_STATUS.OPEN;

        const botMsg = {
            senderId: ticket._id,
            senderModel: SENDER_MODEL.BOT,
            message: "This conversation has been escalated to Live Chat. An available support agent will assist you shortly.",
            isRead: false,
            createdAt: new Date(),
        };
        ticket.messages.push(botMsg);

        await ticket.save();
        await invalidateTicketCache(requesterId, id);

        const io = safeGetIO();
        if (io) {
            io.to(rooms.supportTicket(id.toString())).emit(SOCKET_EVENTS.SUPPORT_STATUS_UPDATED, {
                ticketId: id,
                status: ticket.status,
                chatType: ticket.chatType,
                isEscalatedToLive: true,
            });
            io.to(rooms.adminSupport()).emit(SOCKET_EVENTS.SUPPORT_TICKET_ESCALATED, {
                ticketId: ticket._id,
                ticketCode: ticket.ticketCode,
                requesterId,
                requesterModel,
                subject: ticket.subject,
            });
        }

        return sendResponse({
            res,
            message: "Ticket successfully escalated to live chat agent.",
            data: {
                ticketId: ticket._id,
                chatType: ticket.chatType,
                isEscalatedToLive: ticket.isEscalatedToLive,
                status: ticket.status,
            },
        });
    } catch (err) {
        logger.error("Escalate Ticket Error:", err);
        return sendError(res, "Failed to escalate ticket to live chat.");
    }
};

/**
 * Universal Get FAQ Suggestions by Role
 */
export const getFaqs = async (req, res) => {
    try {
        const requesterModel = getRequesterModelFromRole(req.user.role);
        const faqs = botSupportService.getFaqSuggestions(requesterModel);

        return sendResponse({
            res,
            message: "FAQ suggestions fetched successfully.",
            data: {
                role: requesterModel,
                faqs,
            },
        });
    } catch (err) {
        logger.error("Get FAQs Error:", err);
        return sendError(res, "Failed to fetch FAQ suggestions.");
    }
};
