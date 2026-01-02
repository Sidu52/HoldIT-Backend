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

router.post(
    "/invite",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN),
    validate(inviteSchema),
    createAdminInvite
);

router.get(
    "/",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN),
    getAdmins
);

router.get(
    "/profile",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
    getProfile
);

router.put(
    "/profile",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
    updateProfile
)

router.get(
    "/super",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN),
    getSuperAdmins
);

router.put(
    "/account_status",
    apiLimiter,
    roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
    validate(updateAccountSchema),
    updateAccountStatus
);


export default router;
