import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    adminLogin,
    signUp,
    adminLogout,
    resetPassword,
    verifyAdminInviteToken,
    createAdminForgotPasswordToken,
    updateAdminPassword,
    verifyAdminForgotPasswordToken,
} from "../../controllers/admin/auth.admin.controller.js";
import {
    forgotPasswordSchema,
    loginSchema,
    resetPasswordSchema,
    signupSchema,
    updatePasswordSchema
} from "../../validations/auth.validation.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { sendResponse } from "../../utils/apiResponse.js";
import { refresh } from "../../controllers/common/auth.common.controller.js";
import { USER_ROLES } from "../../utils/constants.js";

const router = express.Router();

// Public
router.post("/login", apiLimiter, validate(loginSchema), adminLogin);
router.post("/signup", apiLimiter, validate(signupSchema), signUp);
router.get("/verify-invite", verifyAdminInviteToken);
router.get("/refresh", apiLimiter, (req, res) => refresh(req, res, USER_ROLES.ADMIN));
router.post("/forgot-password", apiLimiter, validate(forgotPasswordSchema), createAdminForgotPasswordToken);
router.post("/reset-password", apiLimiter, validate(resetPasswordSchema), updateAdminPassword);
router.get("/verify-forgot-password", verifyAdminForgotPasswordToken);
// Protected
router.use(authMiddleware);
router.get("/verify", (req, res) => {
    sendResponse({
        res,
        message: "User is valid",
    });
});
router.post("/logout", adminLogout);
router.put("/reset-password", validate(updatePasswordSchema), resetPassword);

export default router;
