// routes/admin/user.admin.routes.js

import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getUsers,
  getUserById,
  updateUserProfile,
  updateUserStatus,
  bulkDeactivateUsers,
} from "../../controllers/admin/user.admin.controller.js";
import {
  userIdSchema,
  listUsersSchema,
  updateUserSchema,
  updateUserStatusSchema,
  bulkDeactivateSchema,
} from "../../validations/admin/user.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Roles
const VIEW_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
  USER_ROLES.CUSTOMER_SUPPORT,
];

const MODIFY_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
];

// Bulk deactivate 
router.post(
  "/bulk-deactivate",
  apiLimiter,
  roleMiddleware(...MODIFY_ROLES),
  validate(bulkDeactivateSchema),
  bulkDeactivateUsers
);

// List users
router.get(
  "/",
  apiLimiter,
  roleMiddleware(...VIEW_ROLES),
  validate(listUsersSchema, "query"),
  getUsers
);

// Get user by ID
router.get(
  "/:user_id",
  apiLimiter,
  roleMiddleware(...VIEW_ROLES),
  validate(userIdSchema, "params"),
  getUserById
);

// Update user profile
router.put(
  "/:user_id",
  apiLimiter,
  roleMiddleware(...MODIFY_ROLES),
  validate(userIdSchema, "params"),
  validate(updateUserSchema),
  updateUserProfile
);

// Update user status
router.patch(
  "/:user_id/status",
  apiLimiter,
  roleMiddleware(...MODIFY_ROLES),
  validate(userIdSchema, "params"),
  validate(updateUserStatusSchema),
  updateUserStatus
);

export default router;