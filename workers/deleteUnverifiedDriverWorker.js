import { Worker } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";
import Driver from "../models/Driver.js";
import { ACCOUNT_STATUS, JOB_QUEUES } from "../utils/constants.js";
import logger from "../utils/logger.js";


let worker;

export const createDeleteUnverifiedDriverWorker = () => {
    worker = new Worker(
        JOB_QUEUES.DELETE_UNVERIFIED_DRIVER,
        async (job) => {
            const { phone } = job.data;

            if (!phone) {
                logger.error("deleteUnverifiedDriver: Missing phone in job data");
                return { success: false, reason: "missing_phone" };
            }

            try {
                const deletedDriver = await Driver.findOneAndDelete({
                    phone,
                    is_verified: false,
                    status: ACCOUNT_STATUS.PENDING,
                });

                if (deletedDriver) {
                    logger.info(`Deleted unverified driver: ${phone}`);
                    return { success: true, phone, driverId: deletedDriver._id };
                } else {
                    logger.info(`Driver ${phone} already verified or deleted — skipping`);
                    return { success: true, phone, reason: "already_handled" };
                }
            } catch (error) {
                logger.error(`Failed to delete driver ${phone}:`, error.message);
                if (job.moveToFailed) await job.moveToFailed(error, job.token);
                throw error;
            }
        },
        {
            connection: redisConnectionConfig,
            concurrency: 5,
            limiter: {
                max: 10,
                duration: 1000,
            },
        }
    );

    worker.on("error", (err) => {
        logger.error("deleteUnverifiedDriverWorker error:", err.message);
    });

    worker.on("failed", (job, err) => {
        logger.error(
            `deleteUnverifiedDriver failed for ${job?.data?.phone}:`,
            err.message
        );
    });

    return worker;
};

export const getWorker = () => worker;