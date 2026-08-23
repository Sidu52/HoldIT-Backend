import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    getAllTickets,
    getSupportSummary,
    getAdminTicketById,
    replyAsAdmin,
    updateTicketStatus,
    assignTicket,
} from "../../controllers/admin/support.admin.controller.js";

const router = express.Router();

router.use(
    authMiddleware,
    roleMiddleware(
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.ADMIN,
        USER_ROLES.OPERATION_MANAGER,
        USER_ROLES.CUSTOMER_SUPPORT
    ),
    checkAdminAccountStatus
);

// Analytics & Summary
router.get("/summary", apiLimiter, getSupportSummary);

// List all support tickets / chats across all roles
router.get("/", apiLimiter, getAllTickets);

// Get single ticket details
router.get("/:id", apiLimiter, getAdminTicketById);

// Reply to ticket / live chat message
router.post("/:id/reply", apiLimiter, replyAsAdmin);

// Update status (open, in_progress, pending, resolved, closed)
router.patch("/:id/status", apiLimiter, updateTicketStatus);

// Assign / reassign ticket to admin agent
router.patch("/:id/assign", apiLimiter, assignTicket);

export default router;
