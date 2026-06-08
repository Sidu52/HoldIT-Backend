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
  bulkDeactivateDrivers,
  updateDriverStatus,
  driverLocation,
} from "../../controllers/admin/driver.admin.controller.js";
import {
  listDriversSchema,
  driverIdSchema,
  updateDriverSchema,
  bulkDeactivateSchema,
  updateLocationSchema,
  updateDriverAccountSchema,
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

router.delete(
  "/bulk-delete",
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

router.patch(
  "/:driver_id",
  apiLimiter,
  roleMiddleware(...DRIVER_MODIFY_ROLES),
  validate(driverIdSchema, "params"),
  validate(updateDriverSchema, "body"),
  updateDriver
);

router.patch(
  "/:driver_id/location",
  apiLimiter,
  roleMiddleware(...DRIVER_MODIFY_ROLES),
  validate(driverIdSchema, "params"),
  validate(updateLocationSchema, "body"),
  driverLocation
);

router.patch(
  "/:driver_id/status",
  apiLimiter,
  roleMiddleware(...DRIVER_MODIFY_ROLES),
  validate(driverIdSchema, "params"),
  validate(updateDriverAccountSchema, "body"),
  updateDriverStatus
);


export default router;