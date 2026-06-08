import express from "express";
import { createReview, getReviews } from "../../controllers/user/review.controller.js";
import { protectUser } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protectUser, createReview);
router.get("/", protectUser, getReviews);

export default router;
