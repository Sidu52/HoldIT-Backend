import express from "express";
import {authMiddleware,roleMiddleware} from "../middlewares/auth.middleware.js";
import { createBooking } from "../controllers/booking.controller.js";
import { USER_ROLES } from "../utils/constants.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createBookingSchema } from "../validations/booking.validation.js";

const router = express.Router();

router.post("/", authMiddleware, roleMiddleware(USER_ROLES.USER), validate(createBookingSchema), createBooking);

export default router;