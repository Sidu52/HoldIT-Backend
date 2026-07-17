import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
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
  getTeamMemberById,
  bulkDeactivateAdmins,
  updateTeamMember,
  resendInvite
} from "../../controllers/admin/admin.admin.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  inviteSchema,
  updateAccountSchema,
  updateProfileSchema,
  listQuerySchema,
  userIdSchema
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

// Get By ID
router.get(
  "/team/:id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(userIdSchema, "params"),
  getTeamMemberById
)

// Update team members details
router.put(
  "/team/:id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(userIdSchema, "params"),
  validate(updateProfileSchema),
  updateTeamMember
);

// Bulk Deactivate
router.post(
  "/bulk-delete",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  bulkDeactivateAdmins
)

// Get admins only
router.get(
  "/admins",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(listQuerySchema, "query"),
  getAdmins
);

// Get super admins
router.get(
  "/super-admins",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(listQuerySchema, "query"),
  getSuperAdmins
);

// Invite new team member
router.post(
  "/invite",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(inviteSchema),
  createAdminInvite
);

// Resend Invite
router.put(
  "/resend-invite/:id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(userIdSchema, "params"),
  resendInvite
);

// Update account status (block/unblock/etc.)
router.put(
  "/account-status",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(updateAccountSchema),
  updateAccountStatus
);

router.delete(
  "/bulk-delete",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  bulkDeactivateAdmins
)

export default router;