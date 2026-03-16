import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
  getStores,
  getStoreById,
  updateStore,
  toggleStoreStatus,
  deleteStore,
} from "../../controllers/admin/store.admin.controller.js";
import {
  storeIdSchema,
  listStoresSchema,
  updateStoreSchema,
  updateStoreStatusSchema,
} from "../../validations/admin/store.validation.js";

const router = express.Router();

router.use(authMiddleware);

const VIEW_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATION_MANAGER,
];

const MODIFY_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
];

// List stores
router.get(
  "/",
  apiLimiter,
  roleMiddleware(...VIEW_ROLES),
  validate(listStoresSchema, "query"),
  getStores
);

// Get store by ID
router.get(
  "/:store_id",
  apiLimiter,
  roleMiddleware(...VIEW_ROLES),
  validate(storeIdSchema, "params"),
  getStoreById
);

// Update store
router.put(
  "/:store_id",
  apiLimiter,
  roleMiddleware(...MODIFY_ROLES),
  validate(storeIdSchema, "params"),
  validate(updateStoreSchema),
  updateStore
);

// Toggle store status
router.patch(
  "/:store_id/status",
  apiLimiter,
  roleMiddleware(...MODIFY_ROLES),
  validate(storeIdSchema, "params"),
  validate(updateStoreStatusSchema),
  toggleStoreStatus
);

// Soft delete
router.delete(
  "/:store_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN),
  validate(storeIdSchema, "params"),
  deleteStore
);

export default router;