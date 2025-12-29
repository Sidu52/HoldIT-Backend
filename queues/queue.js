import { Queue } from "bullmq";
import redis from "../services/redisService.js";

// export const authUserQueue = new Queue("otpQueue", {
//   connection: redis.duplicate(),
// });

// Define all queues here to keep it centralized
export const authUserQueue = new Queue("otpQueue", {
  connection: redis,
});

export const storeAssignQueue = new Queue("store-assign", {
  connection: redis,
});

export const driverAssignQueue = new Queue("driver-assign", {
  connection: redis,
});

export const driverAssignReturnQueue = new Queue("driver-assign-return", {
  connection: redis,
});

// Queue for 'delete-unverified-user' task
export const deleteUnverifiedUserQueue = new Queue("delete-unverified-user", {
  connection: redis,
});

export const returnDriverQueue = new Queue("return-driver", {
  connection: redis.duplicate()
});
