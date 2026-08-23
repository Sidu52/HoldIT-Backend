import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectAdmin, authorize } from "../../middlewares/auth.middleware.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    sendManualPushNotification,
    getAudienceSummary,
    getNotificationHistory,
    searchPushRecipients,
} from "../../controllers/admin/notification.admin.controller.js";
import { sendManualPushSchema } from "../../validations/admin/notification.validation.js";

const router = express.Router();

// Protected: Admin Auth + Status Check
router.use(authMiddleware, protectAdmin, checkAdminAccountStatus);

// Role Restriction: Allowed for SUPER_ADMIN, ADMIN, and OPERATION_MANAGER
const allowedNotificationRoles = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
];

router.use(authorize(...allowedNotificationRoles));

// Send manual push notification
router.post(
    "/send",
    apiLimiter,
    validate(sendManualPushSchema),
    sendManualPushNotification
);

// Get real-time audience reach statistics
router.get(
    "/audience-summary",
    apiLimiter,
    getAudienceSummary
);

// Get notification history/logs
router.get(
    "/history",
    apiLimiter,
    getNotificationHistory
);

// Search users/drivers for specific push targeting
router.get(
    "/recipients/search",
    apiLimiter,
    searchPushRecipients
);

export default router;
