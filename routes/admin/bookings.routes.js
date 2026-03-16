import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getBookings,
  getBookingById,
  updateBookingStatus,
} from "../../controllers/admin/booking.admin.controller.js";
import {
  listBookingsSchema,
  bookingIdSchema,
  updateBookingStatusSchema,
} from "../../validations/admin/booking.validation.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Roles that can access booking routes
const BOOKING_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
  USER_ROLES.CUSTOMER_SUPPORT,
];

// Roles that can modify bookings
const BOOKING_MODIFY_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
];

// BOOKING ROUTES List all bookings (paginated, filtered)
router.get(
  "/",
  apiLimiter,
  roleMiddleware(...BOOKING_ROLES),
  validate(listBookingsSchema, "query"),
  getBookings
);

// Get single booking by ID
router.get(
  "/:id",
  apiLimiter,
  roleMiddleware(...BOOKING_ROLES),
  validate(bookingIdSchema, "params"),
  getBookingById
);

// Update booking status
router.patch(
  "/:id/status",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  validate(updateBookingStatusSchema),
  updateBookingStatus
);

export default router;