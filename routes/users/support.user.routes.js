import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectUser } from "../../middlewares/auth.middleware.js";
import { checkUserAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    createTicket,
    getUserTickets,
    getTicketById,
    replyToTicket,
    escalateToLive,
    getFaqs,
} from "../../controllers/user/support.user.controller.js";
import {
    createTicketSchema,
    listTicketsSchema,
    ticketIdSchema,
    replyToTicketSchema,
} from "../../validations/user/support.user.validation.js";

const router = express.Router();

router.use(authMiddleware, protectUser, checkUserAccountStatus);

// FAQ Suggestions
router.get("/faqs", apiLimiter, getFaqs);

// Create new support ticket / Bot Chat / Live Chat
router.post(
    "/ticket",
    apiLimiter,
    validate(createTicketSchema),
    createTicket
);

// Get all user tickets
router.get(
    "/tickets",
    apiLimiter,
    validate(listTicketsSchema),
    getUserTickets
);

// Get single ticket details
router.get(
    "/tickets/:id",
    apiLimiter,
    validate(ticketIdSchema),
    getTicketById
);

// Reply to a ticket / send chat message
router.post(
    "/tickets/:id/message",
    apiLimiter,
    validate(replyToTicketSchema),
    replyToTicket
);

// Escalate ticket / chat to Live Agent
router.post(
    "/tickets/:id/escalate",
    apiLimiter,
    validate(ticketIdSchema),
    escalateToLive
);

export default router;