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
    updateStoreOnline,
    createStore,
    bulkDeactivateStores,
    updateStoreCurrentLocation,
} from "../../controllers/admin/store.admin.controller.js";
import {
    storeIdSchema,
    listStoresSchema,
    updateStoreSchema,
    updateStoreStatusSchema,
    updateStoreOnlineSchema,
    createStoreSchema,
} from "../../validations/admin/store.validation.js";
import { updateLocationSchema } from "../../validations/admin/driver.validation.js";

import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";

const router = express.Router();
router.use(authMiddleware, checkAdminAccountStatus);

const VIEW_ROLES = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
];

const MODIFY_ROLES = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
];

router.get("/",
    apiLimiter,
    roleMiddleware(...VIEW_ROLES),
    validate(listStoresSchema, "query"),
    getStores
);

router.delete("/bulk-delete",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    bulkDeactivateStores
);

router.get("/:store_id",
    apiLimiter,
    roleMiddleware(...VIEW_ROLES),
    validate(storeIdSchema, "params"),
    getStoreById
);

router.post("/",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(createStoreSchema, "body"),
    createStore
);

router.put("/:store_id",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeIdSchema, "params"),
    validate(updateStoreSchema, "body"),
    updateStore
);

// Online offline 
router.patch("/:store_id/duty",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeIdSchema, "params"),
    validate(updateStoreOnlineSchema, "body"),
    updateStoreOnline
);

router.patch("/:store_id/status",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeIdSchema, "params"),
    validate(updateStoreStatusSchema, "body"),
    toggleStoreStatus
);

// Update Location 
router.patch("/:store_id/location",
    apiLimiter,
    roleMiddleware(...MODIFY_ROLES),
    validate(storeIdSchema, "params"),
    validate(updateLocationSchema, "body"),
    updateStoreCurrentLocation
)



export default router;