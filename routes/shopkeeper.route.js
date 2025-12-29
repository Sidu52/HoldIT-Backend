import express from "express";
import {
  authUser,
} from "../controllers/auth.controller.js";
import {
  apiLimiter,
  otpLimiter,
} from "../config/rateLimiter.js";
import { USER_ROLES } from "../utils/constants.js";

const router = express.Router();

// Auth
router.post("/", apiLimiter, otpLimiter, (req, res) => authUser(req, res, USER_ROLES.STORE_KEEPER));

export default router;
