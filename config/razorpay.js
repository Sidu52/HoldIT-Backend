import Razorpay from "razorpay";
import dotenv from "dotenv";
dotenv.config();

import logger from "../utils/logger.js";

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  logger.warn("[Razorpay] Warning: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not defined in environment variables");
}

export const razorpay = (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
  ? new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    })
  : null;

export const initRazorpay = async () => {
  if (!razorpay) {
    logger.warn("[Razorpay] Skipped initialization - credentials missing");
    return;
  }

  try {
    // Lightweight check with timeout to prevent startup hangs/crashes
    await Promise.race([
      razorpay.orders.all({ count: 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Razorpay connection timeout (5s)")), 5000))
    ]);
    logger.info("[Razorpay] Initialized successfully");
  } catch (error) {
    const errorMsg = error?.message || error?.error?.description || "Failed to reach Razorpay API";
    logger.warn(`[Razorpay] Warning during initialization: ${errorMsg}. Server will continue running.`);
  }
};