import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import { getStores, getStoreById, createStore, updateStore, deleteStore } from "../../controllers/admin/store.admin.controller.js";
import { getStoreOwners, getStoreOwnerById, createStoreOwner, updateStoreOwner, deleteStoreOwner } from "../../controllers/admin/store.admin.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getStores
);

router.get(
  "/:store_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getStoreById
);

router.post(
  "/",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  createStore
);

router.put(
  "/:store_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  updateStore
);

router.delete(
  "/:store_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  deleteStore
);

router.get(
  "/owners",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getStoreOwners
);

router.get(
  "/owners/:store_owner_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  getStoreOwnerById
);

router.post(
  "/owners",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  createStoreOwner
);

router.put(
  "/owners/:store_owner_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  updateStoreOwner
);

router.delete(
  "/owners/:store_owner_id",
  apiLimiter,
  roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  deleteStoreOwner
);

export default router;
