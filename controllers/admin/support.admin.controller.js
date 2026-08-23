import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, TICKET_STATUS, SENDER_MODEL } from "../../utils/constants.js";
import SupportTicket from "../../models/SupportTicket.js";
import { buildPagination } from "../../utils/helper.js";
import { buildMessage } from "../../helpers/supportHelper.js";
import logger from "../../utils/logger.js";
import { getIO } from "../../src/socket/index.js";
import { rooms } from "../../src/socket/socket.rooms.js";
import { SOCKET_EVENTS } from "../../src/socket/socket.events.js";

const safeGetIO = () => {
    try {
        return getIO();
    } catch {
        return null;
    }
};

/**
 * Admin — Get All Support Tickets & Live Chats with Filters
 */
export const getAllTickets = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            priority,
            category,
            role,
            chatType,
            assignedTo,
            search,
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const sortDir = sort_order === "asc" ? 1 : -1;

        const filter = {};

        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (category) filter.category = category;
        if (role) filter.requesterModel = role;
        if (chatType) filter.chatType = chatType;
        if (assignedTo) filter.assignedTo = assignedTo;

        if (search) {
            filter.$or = [
                { ticketCode: { $regex: search, $options: "i" } },
                { subject: { $regex: search, $options: "i" } },
            ];
        }

        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter)
                .populate("requesterId", "name firstName lastName email phone")
                .populate("assignedTo", "name email")
                .populate("bookingId", "bookingCode status")
                .select("-messages")
                .sort({ lastMessageAt: sortDir })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            SupportTicket.countDocuments(filter),
        ]);

        return sendResponse({
            res,
            message: "Support tickets fetched successfully.",
            data: {
                tickets,
                pagination: buildPagination(pageNum, limitNum, total),
            },
        });
    } catch (err) {
        logger.error("Admin Get All Tickets Error:", err);
        return sendError(res, "Failed to fetch support tickets.");
    }
};

/**
 * Admin — Support Tickets Analytics & Summary Dashboard
 */
export const getSupportSummary = async (req, res) => {
    try {
        const [
            openCount,
            inProgressCount,
            pendingCount,
            awaitingAdminCount,
            resolvedCount,
            closedCount,
            liveChatCount,
            unassignedCount,
            byRole,
        ] = await Promise.all([
            SupportTicket.countDocuments({ status: TICKET_STATUS.OPEN }),
            SupportTicket.countDocuments({ status: TICKET_STATUS.IN_PROGRESS }),
            SupportTicket.countDocuments({ status: TICKET_STATUS.PENDING }),
            SupportTicket.countDocuments({ status: TICKET_STATUS.AWAITING_ADMIN }),
            SupportTicket.countDocuments({ status: TICKET_STATUS.RESOLVED }),
            SupportTicket.countDocuments({ status: TICKET_STATUS.CLOSED }),
            SupportTicket.countDocuments({ chatType: "LIVE_CHAT", status: { $in: [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.AWAITING_ADMIN] } }),
            SupportTicket.countDocuments({ assignedTo: null, status: { $in: [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.AWAITING_ADMIN] } }),
            SupportTicket.aggregate([
                { $group: { _id: "$requesterModel", count: { $sum: 1 } } },
            ]),
        ]);

        const roleBreakdown = byRole.reduce((acc, cur) => {
            acc[cur._id] = cur.count;
            return acc;
        }, {});

        return sendResponse({
            res,
            message: "Support summary fetched successfully.",
            data: {
                statusCounts: {
                    open: openCount,
                    in_progress: inProgressCount,
                    pending: pendingCount,
                    awaiting_admin: awaitingAdminCount,
                    resolved: resolvedCount,
                    closed: closedCount,
                },
                activeLiveChats: liveChatCount,
                unassignedTickets: unassignedCount,
                roleBreakdown,
            },
        });
    } catch (err) {
        logger.error("Get Support Summary Error:", err);
        return sendError(res, "Failed to fetch support summary.");
    }
};

/**
 * Admin — Get Ticket Details by ID
 */
export const getAdminTicketById = async (req, res) => {
    try {
        const { id } = req.params;

        const ticket = await SupportTicket.findById(id)
            .populate("requesterId", "name firstName lastName email phone account_status profileImage")
            .populate("assignedTo", "name email")
            .populate("bookingId", "bookingCode status pickupLocation deliveryLocation luggage")
            .lean();

        if (!ticket) {
            return sendError(res, "Support ticket not found.", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Ticket details fetched successfully.",
            data: ticket,
        });
    } catch (err) {
        logger.error("Admin Get Ticket By ID Error:", err);
        return sendError(res, "Failed to fetch ticket details.");
    }
};

/**
 * Admin — Reply to Ticket / Live Chat Message
 */
export const replyAsAdmin = async (req, res) => {
    try {
        const adminId = req.user.auth_id;
        const { id } = req.params;
        const { message, attachments, status } = req.body;

        const ticket = await SupportTicket.findById(id);
        if (!ticket) {
            return sendError(res, "Support ticket not found.", STATUS_CODES.NOT_FOUND);
        }

        if (ticket.status === TICKET_STATUS.CLOSED) {
            return sendError(res, "This ticket is closed and cannot receive replies.", STATUS_CODES.CONFLICT);
        }

        // Build Admin message
        const adminMsg = buildMessage(adminId, SENDER_MODEL.ADMIN, message, attachments || []);
        ticket.messages.push(adminMsg);

        // Auto assign to this admin if unassigned
        if (!ticket.assignedTo) {
            ticket.assignedTo = adminId;
        }

        // Update status
        if (status && Object.values(TICKET_STATUS).includes(status)) {
            ticket.status = status;
        } else {
            ticket.status = TICKET_STATUS.AWAITING_USER;
        }

        await ticket.save();

        // Broadcast Socket event to requester room and ticket room
        const io = safeGetIO();
        if (io) {
            const savedMsg = ticket.messages[ticket.messages.length - 1];
            io.to(rooms.supportTicket(id.toString())).emit(SOCKET_EVENTS.SUPPORT_NEW_MESSAGE, {
                ticketId: id,
                message: savedMsg,
                status: ticket.status,
            });

            // Room for requester model
            const targetRoom = ticket.requesterModel === "User"
                ? rooms.user(ticket.requesterId.toString())
                : ticket.requesterModel === "Driver"
                ? rooms.driver(ticket.requesterId.toString())
                : rooms.store(ticket.requesterId.toString());

            io.to(targetRoom).emit(SOCKET_EVENTS.SUPPORT_NEW_MESSAGE, {
                ticketId: id,
                ticketCode: ticket.ticketCode,
                messagePreview: message.substring(0, 100),
            });
        }

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Reply sent successfully.",
            data: {
                ticketId: ticket._id,
                status: ticket.status,
                message: ticket.messages[ticket.messages.length - 1],
            },
        });
    } catch (err) {
        logger.error("Admin Reply Error:", err);
        return sendError(res, "Failed to send reply.");
    }
};

/**
 * Admin — Update Ticket Status
 */
export const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!Object.values(TICKET_STATUS).includes(status)) {
            return sendError(res, "Invalid status value.", STATUS_CODES.BAD_REQUEST);
        }

        const ticket = await SupportTicket.findById(id);
        if (!ticket) {
            return sendError(res, "Support ticket not found.", STATUS_CODES.NOT_FOUND);
        }

        ticket.status = status;
        if (status === TICKET_STATUS.RESOLVED) {
            ticket.resolvedAt = new Date();
        } else if (status === TICKET_STATUS.CLOSED) {
            ticket.closedAt = new Date();
        }

        await ticket.save();

        const io = safeGetIO();
        if (io) {
            io.to(rooms.supportTicket(id.toString())).emit(SOCKET_EVENTS.SUPPORT_STATUS_UPDATED, {
                ticketId: id,
                status: ticket.status,
            });
        }

        return sendResponse({
            res,
            message: `Ticket status updated to ${status}.`,
            data: {
                ticketId: ticket._id,
                status: ticket.status,
            },
        });
    } catch (err) {
        logger.error("Update Ticket Status Error:", err);
        return sendError(res, "Failed to update ticket status.");
    }
};

/**
 * Admin — Assign / Reassign Ticket
 */
export const assignTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminId } = req.body;

        const ticket = await SupportTicket.findById(id);
        if (!ticket) {
            return sendError(res, "Support ticket not found.", STATUS_CODES.NOT_FOUND);
        }

        ticket.assignedTo = adminId || null;
        if (ticket.status === TICKET_STATUS.OPEN) {
            ticket.status = TICKET_STATUS.IN_PROGRESS;
        }

        await ticket.save();

        const io = safeGetIO();
        if (io) {
            io.to(rooms.supportTicket(id.toString())).emit(SOCKET_EVENTS.SUPPORT_TICKET_ASSIGNED, {
                ticketId: id,
                assignedTo: ticket.assignedTo,
                status: ticket.status,
            });
        }

        return sendResponse({
            res,
            message: "Ticket assigned successfully.",
            data: {
                ticketId: ticket._id,
                assignedTo: ticket.assignedTo,
                status: ticket.status,
            },
        });
    } catch (err) {
        logger.error("Assign Ticket Error:", err);
        return sendError(res, "Failed to assign ticket.");
    }
};
