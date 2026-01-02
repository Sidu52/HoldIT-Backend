import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getUsers, getUserById, updateUserProfile, createUser, deleteUser } from "../../controllers/admin/user.admin.controller.js";
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

router.delete(
  "/:user_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  updateUserProfile
);

export default router;
