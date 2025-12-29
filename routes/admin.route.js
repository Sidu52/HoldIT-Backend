import express from "express";
import { authMiddleware, roleMiddleware } from "../middlewares/auth.middleware.js";
import { apiLimiter } from "../config/rateLimiter.js";
import { validate } from "../middlewares/validate.middleware.js";
import { USER_ROLES } from "../utils/constants.js";
import {
  createAdminInvite,
  verifyAdminInviteToken,
  signUp,
  adminLogin,
  adminLogout,
  updatePassword,
  refresh,
  getBookings,
  getDrivers,
  getStores,
  getUsers,
  getSuperAdmins,
  getAdmins,
} from "../controllers/auth.admin.controller.js";
import { inviteSchema, loginSchema, signupSchema, updatePasswordSchema } from "../validations/auth.validation.js";

const router = express.Router();

// Public / unauth routes
router.post("/login", apiLimiter, validate(loginSchema), adminLogin);
router.post("/signup", apiLimiter, validate(signupSchema), signUp);
router.get("/verify-invite", verifyAdminInviteToken);
router.get("/refresh", apiLimiter, refresh);

// Protected routes
router.use(authMiddleware);

// Logout
router.post("/logout", adminLogout);

// Account management
router.put("/password", validate(updatePasswordSchema), updatePassword);
router.post("/invite", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN), validate(inviteSchema), createAdminInvite);

// Fetch data
router.get("/verify", (req, res) => {
  res.status(200).json({ message: "User is valid" });
});
router.get("/bookings", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), getBookings);
router.get("/drivers", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), getDrivers);
router.get("/stores", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), getStores);
router.get("/users", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), getUsers);
router.get("/admins", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), getAdmins);
router.get("/super-admins", apiLimiter, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), getSuperAdmins);

export default router;
