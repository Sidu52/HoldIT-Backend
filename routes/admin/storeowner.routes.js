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
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";

const router = express.Router();
router.use(authMiddleware,
  roleMiddleware(
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
  ),
  checkAdminAccountStatus
);

router.get("/",
    apiLimiter,
    validate(listStoreOwnersSchema, "query"),
    getStoreOwners
);

router.get("/:store_owner_id",
    apiLimiter,
    validate(storeOwnerIdSchema, "params"),
    getStoreOwnerById
);

// POST
router.post("/",
    apiLimiter,
    validate(createStoreOwnerSchema, "body"),
    createStoreOwner
);

// PUT
router.put("/:store_owner_id",
    apiLimiter,
    validate(storeOwnerIdSchema, "params"),
    validate(updateStoreOwnerSchema, "body"),
    updateStoreOwner
);

// PATCH
router.patch("/:store_owner_id/status",
    apiLimiter,
    validate(storeOwnerIdSchema, "params"),
    validate(updateOwnerStatusSchema, "body"),
    updateStoreOwnerStatus
);

router.delete("/bulk-delete",
    apiLimiter,
    bulkDeactivateStoreOwners
);

export default router;