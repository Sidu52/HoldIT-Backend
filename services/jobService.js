import { Queue } from "bullmq";
import { createBullConnection } from "./redisService.js";
import { JOB_QUEUES } from "../utils/constants.js";
import logger from "../utils/logger.js";


// QUEUE REGISTRY
const QUEUE_NAMES = Object.values(JOB_QUEUES);
const queues = {};
for (const name of QUEUE_NAMES) {
    // Each queue gets its OWN dedicated ioredis connection
    queues[name] = new Queue(name, {
        connection: createBullConnection(`Queue:${name}`),
        defaultJobOptions: {
            removeOnComplete: { count: 100 },   // keep last 100 completed for inspection
            removeOnFail: { count: 200 },   // keep last 200 failed for debugging
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000,
            },
        },
    });
}

logger.info(`✅ [Queues] Initialized: ${QUEUE_NAMES.join(", ")}`);

//  PUBLIC API
export const addJobToQueue = async (queueName, jobData, options = {}) => {
    const queue = queues[queueName];

    if (!queue) {
        throw new Error(
            `[JobService] Queue "${queueName}" not found. ` +
            `Valid queues: ${QUEUE_NAMES.join(", ")}`
        );
    }

    if (!jobData?.name) {
        throw new Error(`[JobService] jobData.name is required for queue "${queueName}"`);
    }

    return queue.add(jobData.name, jobData.data ?? {}, options);
};

export const cancelJob = async (queueName, jobId) => {
    const queue = queues[queueName];
    if (!queue) {
        logger.warn(`[JobService] cancelJob: queue "${queueName}" not found`);
        return;
    }

    try {
        const job = await queue.getJob(jobId);
        if (!job) return;

        const state = await job.getState();

        // Only remove jobs that haven't started processing yet
        if (state === "delayed" || state === "waiting") {
            await job.remove();
            logger.info(`[JobService] Cancelled job ${jobId} (was ${state})`);
        }
    } catch (err) {
        // Non-fatal job may have already completed/been removed
        logger.warn(`[JobService] Failed to cancel job ${jobId}:`, err.message);
    }
};

/**
 * Gracefully close all queue connections.
 * Call this during process shutdown (SIGTERM/SIGINT handler).
 */
export const closeQueues = async () => {
    await Promise.allSettled(
        Object.entries(queues).map(([name, q]) =>
            q.close().catch((err) =>
                logger.warn(`[JobService] Failed to close queue ${name}:`, err.message)
            )
        )
    );
    logger.info("[JobService] All queues closed");
};

export default queues;