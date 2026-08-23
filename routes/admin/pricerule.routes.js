import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { checkAdminAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    createPriceRule,
    getPriceRules,
    getPriceRuleById,
    getActivePriceRuleByServiceArea,
    updatePriceRule,
    deactivatePriceRule,
    deletePriceRule,
    calculatePriceEstimate,
    clonePriceRule,
} from "../../controllers/admin/priceRule.admin.controller.js";
import {
    priceRuleIdSchema,
    serviceAreaIdParamSchema,
    listPriceRulesSchema,
    createPriceRuleSchema,
    updatePriceRuleSchema,
    deactivatePriceRuleSchema,
    estimatePriceSchema,
    clonePriceRuleSchema,
} from "../../validations/admin/priceRule.validation.js";

const router = express.Router();

// Apply auth and role middlewares for admin access
router.use(
    authMiddleware,
    roleMiddleware(
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.ADMIN,
        USER_ROLES.OPERATION_MANAGER,
        USER_ROLES.CUSTOMER_SUPPORT
    ),
    checkAdminAccountStatus
);

const superAdminOrAdminOnly = roleMiddleware(
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
);

// Create price rule (replaces active rule for given service area)
router.post(
    "/",
    superAdminOrAdminOnly,
    apiLimiter,
    validate(createPriceRuleSchema),
    createPriceRule
);

// Calculate price estimate (preview/simulation)
router.post(
    "/estimate",
    apiLimiter,
    validate(estimatePriceSchema),
    calculatePriceEstimate
);

// Clone existing price rule
router.post(
    "/:id/clone",
    superAdminOrAdminOnly,
    apiLimiter,
    validate(priceRuleIdSchema, "params"),
    validate(clonePriceRuleSchema),
    clonePriceRule
);

// List price rules
router.get(
    "/",
    apiLimiter,
    validate(listPriceRulesSchema, "query"),
    getPriceRules
);

// Get active price rule for service area
router.get(
    "/service-area/:serviceAreaId",
    apiLimiter,
    validate(serviceAreaIdParamSchema, "params"),
    getActivePriceRuleByServiceArea
);

// Get price rule by ID
router.get(
    "/:id",
    apiLimiter,
    validate(priceRuleIdSchema, "params"),
    getPriceRuleById
);

// Update price rule
router.put(
    "/:id",
    superAdminOrAdminOnly,
    apiLimiter,
    validate(priceRuleIdSchema, "params"),
    validate(updatePriceRuleSchema),
    updatePriceRule
);

// Deactivate price rule
router.patch(
    "/:id/deactivate",
    superAdminOrAdminOnly,
    apiLimiter,
    validate(priceRuleIdSchema, "params"),
    validate(deactivatePriceRuleSchema),
    deactivatePriceRule
);

// Delete price rule (Super Admin / Admin only)
router.delete(
    "/:id",
    superAdminOrAdminOnly,
    apiLimiter,
    validate(priceRuleIdSchema, "params"),
    deletePriceRule
);

export default router;

