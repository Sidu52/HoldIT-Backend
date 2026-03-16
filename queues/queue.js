import { Queue } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";
import { JOB_QUEUES } from "../utils/constants.js";

// Added shared default job options to prevent silent job loss
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 3000,
    },
    removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24h for debugging
        count: 1000, // Keep last 1000
    },
    removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
};

export const authUserQueue = new Queue("otpQueue", {
    connection: redisConnectionConfig,
    defaultJobOptions,
});

export const storeAssignQueue = new Queue(JOB_QUEUES.STORE_ASSIGN, {
    connection: redisConnectionConfig,
    defaultJobOptions,
});

export const driverAssignQueue = new Queue(JOB_QUEUES.DRIVER_ASSIGN, {
    connection: redisConnectionConfig,
    defaultJobOptions,
});

export const driverAssignReturnQueue = new Queue("driver-assign-return", {
    connection: redisConnectionConfig,
    defaultJobOptions,
});

export const deleteUnverifiedUserQueue = new Queue( JOB_QUEUES.DELETE_UNVERIFIED_USER, {
    connection: redisConnectionConfig,
    defaultJobOptions,
});

export const deleteUnverifiedDriverQueue = new Queue( JOB_QUEUES.DELETE_UNVERIFIED_DRIVER, {
    connection: redisConnectionConfig,
    defaultJobOptions,
});

export const returnDriverQueue = new Queue("return-driver", {
    connection: redisConnectionConfig,
    // Now uses same config pattern.
    defaultJobOptions,
});

export const closeAllQueues = async () => {
    const allQueues = [
        authUserQueue,
        storeAssignQueue,
        driverAssignQueue,
        driverAssignReturnQueue,
        deleteUnverifiedUserQueue,
        deleteUnverifiedDriverQueue,
        returnDriverQueue,
    ];

    await Promise.allSettled(allQueues.map((q) => q.close()));
    console.log("All queues closed");
};