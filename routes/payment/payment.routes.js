import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    verifyPayment,
    razorpayWebhook,
} from "../../controllers/payment/paymentController.js";

const router = express.Router();

router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    razorpayWebhook
);
router.use(
  authMiddleware,
);


router.post("/verify", verifyPayment);


export default router;