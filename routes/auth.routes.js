import express from "express";
import {
  updateAccount
} from "../controllers/auth.controller.js";
import {
  apiLimiter
} from "../config/rateLimiter.js";
import { authMiddleware, roleMiddleware } from "../middlewares/auth.middleware.js";
import { USER_ROLES } from "../utils/constants.js";
import { validate } from "../middlewares/validate.middleware.js";
import { updateAccountSchema } from "../validations/auth.validation.js";

const router = express.Router();

router.put("/account_status", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), validate(updateAccountSchema), updateAccount);

export default router;
