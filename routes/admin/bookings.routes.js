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
  // reassignDriver,
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
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";



const router = express.Router();

// All routes require authentication
router.use(authMiddleware,
  roleMiddleware(
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
    USER_ROLES.CUSTOMER_SUPPORT
  ),
  checkAdminAccountStatus
);

const manageModify = roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.OPERATION_MANAGER);



// Read Routes
router.get(
  "/",
  apiLimiter,
  validate(listBookingsSchema, "query"),
  getBookings
);

router.get(
  "/:id",
  apiLimiter,
  validate(bookingIdSchema, "params"),
  getBookingById
);

// Cancel
router.put(
  "/:id/cancel",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  cancelBooking
);

// Driver & Store Assignment
router.patch(
  "/:id/assign-driver",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  validate(assignDriverSchema, "body"),
  assignDriver
);

// router.patch(
//   "/:id/reassign-driver",
//   apiLimiter,
//   manageModify,
//   validate(bookingIdSchema, "params"),
//   validate(reassignDriverSchema, "body"),
//   reassignDriver
// );

router.patch(
  "/:id/reassign-store",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  validate(reassignStoreSchema, "body"),
  reassignStore
);

router.patch(
  "/:id/assign-return-driver",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  validate(assignReturnDriverSchema, "body"),
  assignReturnDriver
);

// Status Progression
router.patch(
  "/:id/mark-arrived",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  markDriverArrived
);

router.patch(
  "/:id/mark-picked-up",
  apiLimiter,
 manageModify,
  validate(bookingIdSchema, "params"),
  markPickedUp
);

router.patch(
  "/:id/mark-stored",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  markStored
);

router.patch(
  "/:id/request-return",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  requestReturn
);

router.patch(
  "/:id/mark-delivered",
  apiLimiter,
  manageModify,
  validate(bookingIdSchema, "params"),
  markDelivered
);

export default router;