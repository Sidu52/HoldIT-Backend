import express from "express";
import {
  authUser,
} from "../controllers/auth.controller.js";
import {
  apiLimiter,
  otpLimiter,
} from "../config/rateLimiter.js";
import { USER_ROLES } from "../utils/constants.js";
import { validate } from "../middlewares/validate.middleware.js";
import {authMiddleware,roleMiddleware} from "../middlewares/auth.middleware.js";
import { updateStoreOwnerDetails } from "../controllers/storeOwner.controller.js";
import { updateStoreOwnerSchema, updateStoreSchema } from "../validations/store_owner.validation.js";
import { addStoreDetails, acceptLuggage } from "../controllers/store.controller.js";

const router = express.Router();

// Auth
router.post("/", apiLimiter, otpLimiter, (req, res) => authUser(req, res, USER_ROLES.STORE_KEEPER));
router.put("/", apiLimiter, validate(updateStoreOwnerSchema), authMiddleware, roleMiddleware(USER_ROLES.STORE_KEEPER), updateStoreOwnerDetails);

// Store
router.post("/store_details", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.STORE_KEEPER), validate(updateStoreSchema), addStoreDetails);

// Operations
router.post("/store/bookings/:id/accept-luggage", authMiddleware, roleMiddleware(USER_ROLES.STORE_KEEPER), acceptLuggage);

export default router;
