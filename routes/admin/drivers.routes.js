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
  updateDriverDuty,
} from "../../controllers/admin/driver.admin.controller.js";
import {
  listDriversSchema,
  driverIdSchema,
  updateDriverSchema,
  bulkDeactivateSchema,
  updateLocationSchema,
  updateDriverAccountSchema,
} from "../../validations/admin/driver.validation.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware,
  roleMiddleware(
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
  ),
  checkAdminAccountStatus
);

const manageModify = roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.OPERATION_MANAGER);

// Bulk deactivate

router.delete(
  "/bulk-delete",
  apiLimiter,
  validate(bulkDeactivateSchema),
  bulkDeactivateDrivers
);

// List drivers
router.get(
  "/",
  apiLimiter,
  validate(listDriversSchema, "query"),
  getDrivers
);

// Get single driver
router.get(
  "/:driver_id",
  apiLimiter,
  validate(driverIdSchema, "params"),
  getDriverById
);

router.patch(
  "/:driver_id",
  apiLimiter,
  validate(driverIdSchema, "params"),
  validate(updateDriverSchema, "body"),
  updateDriver
);

router.patch(
  "/:driver_id/location",
  apiLimiter,
  validate(driverIdSchema, "params"),
  validate(updateLocationSchema, "body"),
  driverLocation
);

router.patch(
  "/:driver_id/status",
  apiLimiter,
  validate(driverIdSchema, "params"),
  validate(updateDriverAccountSchema, "body"),
  updateDriverStatus
);

router.patch(
  "/:driver_id/duty",
  apiLimiter,
  validate(driverIdSchema, "params"),
  updateDriverDuty
);


export default router;