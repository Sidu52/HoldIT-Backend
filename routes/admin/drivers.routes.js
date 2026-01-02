import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getDrivers, getDriverById, createDriver, updateDriver, deleteDriver } from "../../controllers/admin/driver.admin.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getDrivers
);

router.get(
  "/:driver_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getDriverById
);

router.post(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  createDriver
);

router.put(
  "/:driver_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  updateDriver
);

router.delete(
  "/:driver_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  deleteDriver
);

export default router;
