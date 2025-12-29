import { Queue } from "bullmq";
import redis from "../services/redisService.js";

// Helper to create a job queue dynamically
const createJobQueue = (queueName) => {
  return new Queue(queueName, {
    connection: redis,
  });
};

// Function to add a job to a specific queue
export const addJobToQueue = async (queueName, jobData, options = {}) => {
  const queue = createJobQueue(queueName);
  await queue.add(jobData.name, jobData.data, options);
};

// Function to cancel a job by jobId
export const cancelJob = async (queueName, jobId) => {
  const queue = createJobQueue(queueName);
  const job = await queue.getJob(jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
};
