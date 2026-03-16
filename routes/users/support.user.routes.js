import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    createTicket,
    getUserTickets,
    getTicketById,
    replyToTicket,
} from "../../controllers/user/support.user.controller.js";
import {
    createTicketSchema,
    listTicketsSchema,
    ticketIdSchema,
    replyToTicketSchema,
} from "../../validations/user/support.user.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Create new support ticket
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

// Reply to a ticket
router.post(
    "/tickets/:id/message",
    apiLimiter,
    validate(replyToTicketSchema),
    replyToTicket
);

export default router;