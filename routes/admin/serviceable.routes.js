import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    createServiceableArea,
    getServiceableAreas,
    getServiceableAreaById,
    updateServiceableArea,
    toggleServiceableAreaStatus,
    deleteServiceableArea,
} from "../../controllers/admin/serviceable.admin.controller.js";
import {
    serviceableAreaIdSchema,
    listServiceableAreasSchema,
    createServiceableAreaSchema,
    updateServiceableAreaSchema,
    toggleStatusSchema,
} from "../../validations/admin/serviceableArea.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Roles
const AREA_VIEW_ROLES = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
    USER_ROLES.OPERATION_MANAGER,
];

const AREA_MODIFY_ROLES = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
];


// Create serviceable area
router.post(
    "/",
    apiLimiter,
    roleMiddleware(...AREA_MODIFY_ROLES),
    validate(createServiceableAreaSchema),
    createServiceableArea
);

// List serviceable areas
router.get(
    "/",
    apiLimiter,
    roleMiddleware(...AREA_VIEW_ROLES),
    validate(listServiceableAreasSchema, "query"),
    getServiceableAreas
);

// Get single serviceable area
router.get(
    "/:id",
    apiLimiter,
    roleMiddleware(...AREA_VIEW_ROLES),
    validate(serviceableAreaIdSchema, "params"),
    getServiceableAreaById
);

// Update serviceable area
router.put(
    "/:id",
    apiLimiter,
    roleMiddleware(...AREA_MODIFY_ROLES),
    validate(serviceableAreaIdSchema, "params"),
    validate(updateServiceableAreaSchema),
    updateServiceableArea
);

// Toggle active status
router.patch(
    "/:id/status",
    apiLimiter,
    roleMiddleware(...AREA_MODIFY_ROLES),
    validate(serviceableAreaIdSchema, "params"),
    validate(toggleStatusSchema),
    toggleServiceableAreaStatus
);

// Soft delete (Super Admin only)
router.delete(
    "/:id",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN),
    validate(serviceableAreaIdSchema, "params"),
    deleteServiceableArea
);

export default router;