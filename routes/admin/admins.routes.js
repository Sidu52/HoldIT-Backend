import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    getAdmins,
    getSuperAdmins,
    createAdminInvite,
    getProfile,
    updateAccountStatus,
    updateProfile
} from "../../controllers/admin/admin.admin.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { inviteSchema, updateAccountSchema } from "../../validations/auth.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Get profile
router.get(
    "/profile",
    apiLimiter,
    getProfile
);

// Invite user
router.post(
    "/invite",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN),
    validate(inviteSchema),
    createAdminInvite
);

// Get admins
router.get(
    "/",
    apiLimiter,
    getAdmins
);

// Update profile
router.put(
    "/profile",
    apiLimiter,
    updateProfile
)

// Get super admins
router.get(
    "/super",
    apiLimiter,
    getSuperAdmins
);

// Update account status
router.put(
    "/account_status",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
    validate(updateAccountSchema),
    updateAccountStatus
);


export default router;
