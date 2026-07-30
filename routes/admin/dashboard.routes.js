import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getDashboardSummary,
  getChartData,
} from "../../controllers/admin/dashboard.admin.controller.js";
import { dashboardChartSchema } from "../../validations/admin/dashboard.validation.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";

const router = express.Router();

router.use(authMiddleware,
   roleMiddleware(
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
    USER_ROLES.CUSTOMER_SUPPORT
  ),
  checkAdminAccountStatus
);

// Dashboard summary
router.get(
  "/summary",
  apiLimiter,
  getDashboardSummary
);

// Chart data
router.get(
  "/chart",
  apiLimiter,
  validate(dashboardChartSchema, "query"),
  getChartData
);

export default router;