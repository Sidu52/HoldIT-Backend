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

const router = express.Router();

router.use(authMiddleware);

// Roles that can view dashboard
const DASHBOARD_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
];

// Dashboard summary
router.get(
  "/summary",
  apiLimiter,
  roleMiddleware(...DASHBOARD_ROLES),
  getDashboardSummary
);

// Chart data
router.get(
  "/chart",
  apiLimiter,
  roleMiddleware(...DASHBOARD_ROLES),
  validate(dashboardChartSchema, "query"),
  getChartData
);

export default router;