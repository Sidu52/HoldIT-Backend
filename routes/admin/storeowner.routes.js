// routes/admin/storeOwner.admin.routes.js

import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    getStoreOwners,
    getStoreOwnerById,
    updateStoreOwner,
    updateStoreOwnerStatus,
    deleteStoreOwner,
} from "../../controllers/admin/storeOwner.admin.controller.js";
import {
    storeOwnerIdSchema,
    listStoreOwnersSchema,
    updateStoreOwnerSchema,
    updateOwnerStatusSchema,
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

// List store owners
router.get(
    "/",
    apiLimiter,
    roleMiddleware(...VIEW_ROLES),
    validate(listStoreOwnersSchema, "query"),
    getStoreOwners
);

// Get store owner by ID
router.get(
    "/:store_owner_id",
    apiLimiter,
    roleMiddleware(...VIEW_ROLES),
    validate(storeOwnerIdSchema, "params"),
    getStoreOwnerById
);

// Update store owner
router.put(
    "/:store_owner_id",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeOwnerIdSchema, "params"),
    validate(updateStoreOwnerSchema),
    updateStoreOwner
);

// Update store owner status
router.patch(
    "/:store_owner_id/status",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeOwnerIdSchema, "params"),
    validate(updateOwnerStatusSchema),
    updateStoreOwnerStatus
);

// Soft delete store owner (Super Admin only)
router.delete(
    "/:store_owner_id",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN),
    validate(storeOwnerIdSchema, "params"),
    deleteStoreOwner
);

export default router;