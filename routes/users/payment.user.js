import express from "express";
import { dummyCheckout } from "../../controllers/user/payment.controller.js";
import { protectUser } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/checkout", protectUser, dummyCheckout);

export default router;
