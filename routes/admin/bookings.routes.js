import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getBookings,
  getBookingById,
  cancelBooking,
  assignDriver,
  reassignDriver,
  reassignStore,
  assignReturnDriver,
  markDriverArrived,
  markPickedUp,
  markStored,
  requestReturn,
  markDelivered,
} from "../../controllers/admin/booking.admin.controller.js";
import {
  listBookingsSchema,
  bookingIdSchema,
  assignDriverSchema,
  reassignDriverSchema,
  reassignStoreSchema,
  assignReturnDriverSchema,
} from "../../validations/admin/booking.validation.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Role Groups
// Read access support can view but not modify
const BOOKING_READ_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
  USER_ROLES.CUSTOMER_SUPPORT,
];

// Modify access operations and above
const BOOKING_MODIFY_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
];

// Read Routes
router.get(
  "/",
  apiLimiter,
  roleMiddleware(...BOOKING_READ_ROLES),
  validate(listBookingsSchema, "query"),
  getBookings
);

router.get(
  "/:id",
  apiLimiter,
  roleMiddleware(...BOOKING_READ_ROLES),
  validate(bookingIdSchema, "params"),
  getBookingById
);

// Cancel
router.put(
  "/:id/cancel",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  cancelBooking
);

// Driver & Store Assignment
router.patch(
  "/:id/assign-driver",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  validate(assignDriverSchema, "body"),
  assignDriver
);

router.patch(
  "/:id/reassign-driver",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  validate(reassignDriverSchema, "body"),
  reassignDriver
);

router.patch(
  "/:id/reassign-store",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  validate(reassignStoreSchema, "body"),
  reassignStore
);

router.patch(
  "/:id/assign-return-driver",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  validate(assignReturnDriverSchema, "body"),
  assignReturnDriver
);

// Status Progression
router.patch(
  "/:id/mark-arrived",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  markDriverArrived
);

router.patch(
  "/:id/mark-picked-up",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  markPickedUp
);

router.patch(
  "/:id/mark-stored",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  markStored
);

router.patch(
  "/:id/request-return",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  requestReturn
);

router.patch(
  "/:id/mark-delivered",
  apiLimiter,
  roleMiddleware(...BOOKING_MODIFY_ROLES),
  validate(bookingIdSchema, "params"),
  markDelivered
);

export default router;