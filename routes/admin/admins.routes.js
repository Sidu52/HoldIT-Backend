import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  createAdminInvite,
  getProfile,
  updateAccountStatus,
  updateProfile,
  getTeamsMember,
  getTeamMemberById,
  bulkDeactivateAdmins,
  updateTeamMember,
  resendInvite,
} from "../../controllers/admin/admin.admin.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  inviteSchema,
  updateAccountSchema,
  updateProfileSchema,
  listQuerySchema,
  userIdSchema,
} from "../../validations/admin/admin.validation.js";

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

const manageTeamOnly = roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN);


router.get("/profile", apiLimiter, getProfile);
router.put("/profile", apiLimiter, validate(updateProfileSchema), updateProfile);

router.get("/team", apiLimiter, validate(listQuerySchema, "query"), getTeamsMember);
router.get("/team/:id", apiLimiter, validate(userIdSchema, "params"), getTeamMemberById);

router.put(
  "/team/:id",
  manageTeamOnly,
  apiLimiter,
  validate(userIdSchema, "params"),
  validate(updateProfileSchema),
  updateTeamMember
);

router.delete("/bulk-delete", manageTeamOnly, apiLimiter, bulkDeactivateAdmins);

import {
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
} from "../../controllers/admin/teamJoinRequest.admin.controller.js";

router.get("/join-requests", apiLimiter, getJoinRequests);
router.patch("/join-requests/:id/approve", manageTeamOnly, apiLimiter, approveJoinRequest);
router.patch("/join-requests/:id/reject", manageTeamOnly, apiLimiter, rejectJoinRequest);
router.put("/resend-invite/:id", manageTeamOnly, apiLimiter, validate(userIdSchema, "params"), resendInvite);

router.put("/account-status/:id", manageTeamOnly, apiLimiter, 
  validate(userIdSchema, "params"),
  validate(updateAccountSchema), updateAccountStatus);

export default router;