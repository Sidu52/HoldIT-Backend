import { Queue } from "bullmq";
import { createBullConnection } from "./redisService.js";
import { JOB_QUEUES } from "../utils/constants.js";
import logger from "../utils/logger.js";


// QUEUE REGISTRY
const QUEUE_NAMES = Object.values(JOB_QUEUES);
const queues = {};
const queueConnections = {}; // Store connections separately

const getOrCreateQueue = (name) => {
    // If queue already exists and connection is alive, reuse it
    if (queues[name] && queueConnections[name]?.status === "ready") {
        logger.info(`[Queues] Reusing existing queue: ${name}`);
        return queues[name];
    }

    // Close stale connection if it exists
    if (queueConnections[name] && queueConnections[name].status !== "ready") {
        logger.warn(`[Queues] Stale connection for ${name}, recreating...`);
        queueConnections[name].disconnect().catch(() => { });
    }

    // Create new connection and queue
    const connection = createBullConnection(`Queue:${name}`);
    queueConnections[name] = connection;

    queues[name] = new Queue(name, {
        connection,
        defaultJobOptions: {
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 200 },
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000,
            },
        },
    });

    logger.info(`[Queues] Initialized new queue: ${name}`);
    return queues[name];
};

// Initialize all queues
for (const name of QUEUE_NAMES) {
    getOrCreateQueue(name);
}

logger.info(`✅ [Queues] Initialized: ${QUEUE_NAMES.join(", ")}`);

//  PUBLIC API
export const addJobToQueue = async (queueName, jobData, options = {}) => {
    // Auto-heal: recreate queue if connection is dead
    const queue = getOrCreateQueue(queueName);

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
        Object.entries(queues).map(async ([name, q]) => {
            try {
                await q.close();
                queueConnections[name]?.disconnect();
            } catch (err) {
                logger.warn(`[JobService] Failed to close queue ${name}:`, err.message);
            }
        })
    );
    logger.info("[JobService] All queues closed");
};

export default queues;