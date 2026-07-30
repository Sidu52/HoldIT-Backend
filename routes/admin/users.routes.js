import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import {
    getUsers,
    getUserById,
    updateUserProfile,
    updateUserStatus,
    bulkDeactivateUsers,
    addUserAddress,
    deleteUserAddress,
    updateUserAddress,
} from "../../controllers/admin/user.admin.controller.js";
import {
    userIdSchema,
    listUsersSchema,
    updateUserSchema,
    updateUserStatusSchema,
    bulkDeactivateUsersSchema,
} from "../../validations/admin/user.validation.js";
import { addAddressSchema, updateAddressSchema } from "../../validations/user/user.address.validation.js";
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

const manageModify = roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.OPERATION_MANAGER);

router.delete("/bulk-delete",
    apiLimiter,
    validate(bulkDeactivateUsersSchema, "body"),
    bulkDeactivateUsers
);

// Get all users
router.get("/",
    apiLimiter,
    validate(listUsersSchema, "query"),
    getUsers
);

// Get user by ID
router.get("/:user_id",
    apiLimiter,
    validate(userIdSchema, "params"),
    getUserById
);

// Update user profile
router.put("/:user_id",
    apiLimiter,
    manageModify,
    validate(userIdSchema, "params"),
    validate(updateUserSchema, "body"),
    updateUserProfile
);

// Update user status
router.patch("/:user_id/status",
    apiLimiter,
    manageModify,
    validate(userIdSchema, "params"),
    validate(updateUserStatusSchema, "body"),
    updateUserStatus
);

router.put(
    "/:userId/addresses/:addressId",
    manageModify,
    validate(updateAddressSchema),
    updateUserAddress
);

router.post(
    "/:userId/addresses",
    manageModify,
    validate(addAddressSchema),
    addUserAddress
);

router.delete(
    "/:userId/addresses/:addressId",
    manageModify,
    deleteUserAddress
);


export default router;