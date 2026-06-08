import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    createStoreOwner,
    getStoreOwners,
    getStoreOwnerById,
    updateStoreOwner,
    updateStoreOwnerStatus,
    bulkDeactivateStoreOwners,
} from "../../controllers/admin/storeOwner.admin.controller.js";
import {
    storeOwnerIdSchema,
    listStoreOwnersSchema,
    createStoreOwnerSchema,
    updateStoreOwnerSchema,
    updateOwnerStatusSchema,
} from "../../validations/admin/store_owner.validation.js";

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

router.get("/",
    apiLimiter,
    roleMiddleware(...VIEW_ROLES),
    validate(listStoreOwnersSchema, "query"),
    getStoreOwners
);

router.get("/:store_owner_id",
    apiLimiter,
    roleMiddleware(...VIEW_ROLES),
    validate(storeOwnerIdSchema, "params"),
    getStoreOwnerById
);

// POST
router.post("/",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(createStoreOwnerSchema, "body"),
    createStoreOwner
);

// PUT
router.put("/:store_owner_id",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeOwnerIdSchema, "params"),
    validate(updateStoreOwnerSchema, "body"),
    updateStoreOwner
);

// PATCH
router.patch("/:store_owner_id/status",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeOwnerIdSchema, "params"),
    validate(updateOwnerStatusSchema, "body"),
    updateStoreOwnerStatus
);

router.delete("/bulk-delete",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    bulkDeactivateStoreOwners
);

export default router;