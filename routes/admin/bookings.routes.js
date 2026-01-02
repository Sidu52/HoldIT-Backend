import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getBookings, updateBooking, createBooking, deleteBooking } from "../../controllers/admin/booking.admin.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getBookings
);

router.post(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  createBooking
)

router.put(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  updateBooking
)

router.delete(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  deleteBooking
)

export default router;
