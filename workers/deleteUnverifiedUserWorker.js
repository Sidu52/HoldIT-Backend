import { Worker } from "bullmq";
import redis from "../services/redisService.js"
import User from "../models/User.js";

// Worker for processing the 'delete-unverified-user' job
export const deleteUnverifiedUserWorker = new Worker(
  "delete-unverified-user",
  async (job) => {
    const { phone } = job.data;
    try {
      await User.deleteOne({ phone, isVerified: false });
      console.log(`Deleted unverified user: ${phone}`);
    } catch (error) {
      console.error(`Failed to delete user ${phone}:`, error);
      throw error; // Mark job as failed
    }
  },
  {
    connection: redis,
  }
);
