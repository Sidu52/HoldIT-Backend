import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectStoreOwner } from "../../middlewares/auth.middleware.js";
import { checkStoreOwnerAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    createTicket,
    getUserTickets as getStoreOwnerTickets,
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

router.use(authMiddleware, protectStoreOwner, checkStoreOwnerAccountStatus);

router.get("/faqs", apiLimiter, getFaqs);

router.post("/ticket", apiLimiter, validate(createTicketSchema), createTicket);
router.get("/tickets", apiLimiter, validate(listTicketsSchema), getStoreOwnerTickets);
router.get("/tickets/:id", apiLimiter, validate(ticketIdSchema), getTicketById);
router.post("/tickets/:id/message", apiLimiter, validate(replyToTicketSchema), replyToTicket);
router.post("/tickets/:id/escalate", apiLimiter, validate(ticketIdSchema), escalateToLive);

export default router;
