import { Worker } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";
import User from "../models/User.js";
import { ACCOUNT_STATUS, JOB_QUEUES } from "../utils/constants.js";
import logger from "../utils/logger.js";


let worker;

export const createDeleteUnverifiedUserWorker = () => {
    worker = new Worker(
         JOB_QUEUES.DELETE_UNVERIFIED_USER,
        async (job) => {
            try {
                const { phone } = job.data;

                if (!phone) {
                    return { success: false, reason: "missing_phone" };
                }

                const deletedUser = await User.findOneAndDelete({
                    phone,
                    is_verified: false,
                    status: ACCOUNT_STATUS.PENDING,
                });

                if (deletedUser) {
                    logger.info(`Deleted unverified user: ${phone}`);
                    return { success: true, phone };
                }

                logger.info(`User ${phone} already verified or deleted`);
                return { success: true, reason: "already_handled" };
            } catch (err) {
                if (job.moveToFailed) await job.moveToFailed(err, job.token);
                throw err;
            }
        },
        {
            connection: redisConnectionConfig,
            concurrency: 5,
        }
    );

    worker.on("error", (err) => {
        logger.error("deleteUnverifiedUserWorker error:", err.message);
    });

    worker.on("failed", (job, err) => {
        logger.error(`deleteUnverifiedUserWorker Job ${job?.id} failed:`, err.message);
    });

    return worker;
};

export const getWorker = () => worker;
