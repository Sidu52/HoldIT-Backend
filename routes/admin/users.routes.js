import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getUsers, getUserById, updateUserProfile, updateUserStatus, createUser, bulkDeleteUsers } from "../../controllers/admin/user.admin.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { updateUserSchema } from "../../validations/user.validation.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getUsers
);

router.get(
  "/:user_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getUserById
);

router.post(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(updateUserSchema),
  updateUserProfile
);

router.put(
  "/update",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  validate(updateUserSchema),
  updateUserProfile
);

// /users/${id}/status
router.patch(
  "/:user_id/status",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  updateUserStatus
);

// /users/delete
router.delete(
  "/bulk-delete",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  bulkDeleteUsers
);

export default router;
