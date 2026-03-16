import { Queue } from "bullmq";
import { createBullConnection } from "./redisService.js";
import { JOB_QUEUES } from "../utils/constants.js";

const connection = createBullConnection("Queue");

const queues = {};

const QUEUE_NAMES = [
    JOB_QUEUES.STORE_ASSIGN,
    JOB_QUEUES.DRIVER_ASSIGN,
    JOB_QUEUES.BOOKING_AUTO_CANCEL,
    JOB_QUEUES.DELETE_UNVERIFIED_USER,
    JOB_QUEUES.DELETE_UNVERIFIED_DRIVER,
];

QUEUE_NAMES.forEach((name) => {
    queues[name] = new Queue(name, { connection });
});

console.log(`✅ [Queues] Initialized: ${QUEUE_NAMES.join(", ")}`);

export const addJobToQueue = async (queueName, jobData, options = {}) => {
    const queue = queues[queueName];
    if (!queue) {
        throw new Error(`Queue "${queueName}" not found`);
    }
    return queue.add(jobData.name, jobData.data, options);
};

export const cancelJob = async (queueName, jobId) => {
    try {
        const queue = queues[queueName];
        if (!queue) return;

        const job = await queue.getJob(jobId);
        if (job) {
            const state = await job.getState();
            if (state === "delayed" || state === "waiting") {
                await job.remove();
            }
        }
    } catch (err) {
        console.error(`Failed to cancel job ${jobId}:`, err.message);
    }
};

export { connection };
export default queues;