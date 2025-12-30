import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getDashboardSummary } from "../../controllers/admin/dashboard.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/summary",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getDashboardSummary
);

export default router;
