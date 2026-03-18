import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getAdmins,
  getSuperAdmins,
  createAdminInvite,
  getProfile,
  updateAccountStatus,
  updateProfile,
  getTeamsMember,
} from "../../controllers/admin/admin.admin.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  inviteSchema,
  updateAccountSchema,
  updateProfileSchema,
  listQuerySchema,
} from "../../validations/admin/admin.validation.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get own profile
router.get(
  "/profile",
  apiLimiter,
  getProfile
);

// Update own profile
router.put(
  "/profile",
  apiLimiter,
  validate(updateProfileSchema),
  updateProfile
);

// Get all team members
router.get(
  "/team",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(listQuerySchema, "query"),
  getTeamsMember
);

// Get admins only
router.get(
  "/admins",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN),
  validate(listQuerySchema, "query"),
  getAdmins
);

// Get super admins
router.get(
  "/super-admins",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN),
  validate(listQuerySchema, "query"),
  getSuperAdmins
);

// Invite new team member
router.post(
  "/invite",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN),
  validate(inviteSchema),
  createAdminInvite
);

// Update account status (block/unblock/etc.)
router.put(
  "/account-status",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(updateAccountSchema),
  updateAccountStatus
);

export default router;