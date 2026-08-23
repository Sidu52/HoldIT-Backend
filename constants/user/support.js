import { TICKET_STATUS } from "../../utils/constants.js";

// Removed SUPPORT_CACHE (Migrated to constants/redis/support.keys.js)

export const SUPPORT_LIMITS = {
    MAX_OPEN_TICKETS: 5,
    MAX_MESSAGE_LENGTH: 2000,
    MAX_SUBJECT_LENGTH: 300,
    MAX_ATTACHMENTS_PER_MESSAGE: 3,
    MAX_MESSAGES_PER_TICKET: 100,
};

export const OPEN_TICKET_STATUSES = [
    TICKET_STATUS.OPEN,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.PENDING,
    TICKET_STATUS.AWAITING_USER,
    TICKET_STATUS.AWAITING_ADMIN,
];

export const CLOSED_TICKET_STATUSES = [
    TICKET_STATUS.RESOLVED,
    TICKET_STATUS.CLOSED,
];

export const REPLYABLE_STATUSES = [
    TICKET_STATUS.OPEN,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.PENDING,
    TICKET_STATUS.AWAITING_USER,
    TICKET_STATUS.AWAITING_ADMIN,
];

export const SUPPORT_SELECT = {
    LIST: "ticketCode subject category priority status lastMessageAt lastMessageBy bookingId createdAt",
    DETAIL: "-__v",
};

export const SUPPORT_QUEUES = {
    TICKET_CREATED: "support-ticket-created",
    TICKET_REPLY: "support-ticket-reply",
};

export const SUPPORT_JOB_NAMES = {
    TICKET_CREATED: "TICKET_CREATED",
    NEW_USER_REPLY: "NEW_USER_REPLY",
};

export const SUPPORT_JOB_OPTIONS = {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 5000,
    },
};

export const SUPPORT_MESSAGES = {
    TICKET_CREATED: "Support ticket created successfully.",
    TICKETS_FETCHED: "Support tickets fetched successfully.",
    TICKET_FETCHED: "Ticket details fetched successfully.",
    REPLY_SENT: "Reply sent successfully.",

    TICKET_NOT_FOUND: "Support ticket not found.",
    MAX_OPEN_REACHED: (max) =>
        `You can have maximum ${max} open support tickets. Please wait for existing tickets to be resolved.`,
    TICKET_CLOSED: "This ticket is closed and cannot receive new messages.",
    MAX_MESSAGES_REACHED: (max) =>
        `This ticket has reached the maximum of ${max} messages. Please create a new ticket.`,
    BOOKING_NOT_FOUND: "Referenced booking not found.",
    CREATE_FAILED: "Failed to create support ticket.",
    FETCH_FAILED: "Failed to fetch support tickets.",
    DETAIL_FAILED: "Failed to fetch ticket details.",
    REPLY_FAILED: "Failed to send reply.",
};