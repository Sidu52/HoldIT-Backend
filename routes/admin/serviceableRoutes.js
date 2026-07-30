import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    createArea,
    getAreas,
    getAreaById,
    updateArea,
    toggleAreaStatus,
    deleteArea,
    checkServiceable,
    getDistance
} from "../../controllers/admin/serviceable.admin.controller.js";
import {
    serviceableAreaIdSchema,
    listServiceableAreasSchema,
    createServiceableAreaSchema,
    updateServiceableAreaSchema,
    toggleStatusSchema,
    checkServiceableSchema,
    distanceSchema,
} from "../../validations/admin/serviceableArea.validation.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";

const router = express.Router();

router.use(authMiddleware,
  roleMiddleware(
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
    USER_ROLES.CUSTOMER_SUPPORT
  ),
  checkAdminAccountStatus
);



// Create serviceable area
router.post(
    "/",
    apiLimiter,
    validate(createServiceableAreaSchema),
    createArea
);

// List serviceable areas
router.get(
    "/",
    apiLimiter,
    validate(listServiceableAreasSchema, "query"),
    getAreas
);

// Get single serviceable area
router.get(
    "/:id",
    apiLimiter,
    validate(serviceableAreaIdSchema, "params"),
    getAreaById
);

// Update serviceable area
router.put(
    "/:id",
    apiLimiter,
    validate(serviceableAreaIdSchema, "params"),
    validate(updateServiceableAreaSchema),
    updateArea
);

// Toggle active status
router.patch(
    "/:id/status",
    apiLimiter,
    validate(serviceableAreaIdSchema, "params"),
    validate(toggleStatusSchema),
    toggleAreaStatus
);

// Soft delete (Super Admin only)
router.delete(
    "/:id",
    apiLimiter,
    validate(serviceableAreaIdSchema, "params"),
    deleteArea
);

// Check serviceable area
router.get(
    "/check-serviceability",
    apiLimiter,
    validate(checkServiceableSchema, "query"),
    checkServiceable
);

// Distance calculation
router.get(
    "/distance",
    apiLimiter,
    validate(distanceSchema, "query"),
    getDistance
);

export default router;