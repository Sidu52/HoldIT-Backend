import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectStore } from "../../middlewares/auth.middleware.js";
import { checkStoreAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    createTicket,
    getUserTickets as getStoreTickets,
    getTicketById,
    replyToTicket,
    escalateToLive,
    getFaqs,
} from "../../controllers/common/support.controller.js";
import {
    createTicketSchema,
    listTicketsSchema,
    ticketIdSchema,
    replyToTicketSchema,
} from "../../validations/user/support.user.validation.js";

const router = express.Router();

router.use(authMiddleware, protectStore, checkStoreAccountStatus);

router.get("/faqs", apiLimiter, getFaqs);

router.post("/ticket", apiLimiter, validate(createTicketSchema), createTicket);
router.get("/tickets", apiLimiter, validate(listTicketsSchema), getStoreTickets);
router.get("/tickets/:id", apiLimiter, validate(ticketIdSchema), getTicketById);
router.post("/tickets/:id/message", apiLimiter, validate(replyToTicketSchema), replyToTicket);
router.post("/tickets/:id/escalate", apiLimiter, validate(ticketIdSchema), escalateToLive);

export default router;
