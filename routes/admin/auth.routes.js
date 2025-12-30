import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    adminLogin,
    signUp,
    refresh,
    adminLogout,
    updatePassword,
    verifyAdminInviteToken
} from "../../controllers/admin/auth.admin.controller.js";
import {
    loginSchema,
    signupSchema,
    updatePasswordSchema
} from "../../validations/auth.validation.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { sendResponse } from "../../utils/apiResponse.js";

const router = express.Router();

// Public
router.post("/login", apiLimiter, validate(loginSchema), adminLogin);
router.post("/signup", apiLimiter, validate(signupSchema), signUp);
router.get("/verify-invite", verifyAdminInviteToken);
router.get("/refresh", apiLimiter, refresh);

// Protected
router.use(authMiddleware);
router.get("/verify", (req, res) => {
    sendResponse({
        res,
        message: "User is valid",
    });
});
router.post("/logout", adminLogout);
router.put("/password", validate(updatePasswordSchema), updatePassword);

export default router;
