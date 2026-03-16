import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getDrivers,
  getDriverById,
  updateDriver,
  updateDriverStatus,
  bulkDeactivateDrivers,
} from "../../controllers/admin/driver.admin.controller.js";
import {
  listDriversSchema,
  driverIdSchema,
  updateDriverSchema,
  updateDriverStatusSchema,
  bulkDeactivateSchema,
} from "../../validations/admin/driver.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Roles
const DRIVER_VIEW_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
];

const DRIVER_MODIFY_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
];

// Bulk deactivate
router.post(
  "/bulk-deactivate",
  apiLimiter,
  roleMiddleware(...DRIVER_MODIFY_ROLES),
  validate(bulkDeactivateSchema),
  bulkDeactivateDrivers
);

// List drivers
router.get(
  "/",
  apiLimiter,
  roleMiddleware(...DRIVER_VIEW_ROLES),
  validate(listDriversSchema, "query"),
  getDrivers
);

// Get single driver
router.get(
  "/:driver_id",
  apiLimiter,
  roleMiddleware(...DRIVER_VIEW_ROLES),
  validate(driverIdSchema, "params"),
  getDriverById
);

// Update driver details
router.put(
  "/:driver_id",
  apiLimiter,
  roleMiddleware(...DRIVER_MODIFY_ROLES),
  validate(driverIdSchema, "params"),
  validate(updateDriverSchema),
  updateDriver
);

// Update driver status
router.patch(
  "/:driver_id/status",
  apiLimiter,
  roleMiddleware(...DRIVER_MODIFY_ROLES),
  validate(driverIdSchema, "params"),
  validate(updateDriverStatusSchema),
  updateDriverStatus
);

export default router;