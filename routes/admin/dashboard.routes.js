import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getDashboardSummary,getChartData } from "../../controllers/admin/dashboard.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/summary",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getDashboardSummary
);

router.get(
  "/chart",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getChartData
);

export default router;
