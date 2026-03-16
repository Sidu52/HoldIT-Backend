import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    getDriverDetails,
    getDriverReviews,
} from "../../controllers/user/driver.user.controller.js";
import {
    driverIdSchema,
    driverReviewsSchema,
} from "../../validations/user/driver.user.validation.js";

const router = express.Router();

router.use(authMiddleware);

router.get(
    "/:id/details",
    apiLimiter,
    validate(driverIdSchema),
    getDriverDetails
);

router.get(
    "/:id/reviews",
    apiLimiter,
    validate(driverReviewsSchema),
    getDriverReviews
);


export default router;