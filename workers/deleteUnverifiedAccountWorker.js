import { Worker } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";
import User from "../models/User.js";
import Driver from "../models/Driver.js";
import Store from "../models/Store.js";
import { ACCOUNT_STATUS, JOB_QUEUES } from "../utils/constants.js";
import logger from "../utils/logger.js";


/**
 * Higher-level function to create a worker for deleting unverified accounts.
 * This can be used for Users, Drivers, or Stores by specifying the queue name.
 */
export const createDeleteUnverifiedWorker = (queueName) => {
    const worker = new Worker(
        queueName,
        async (job) => {
            try {
                const { phone, entity } = job.data;

                if (!phone) {
                    return { success: false, reason: "missing_phone" };
                }

                let model;
                switch (entity) {
                    case "driver": model = Driver; break;
                    case "store": model = Store; break;
                    default: model = User; break;
                }

                const deleted = await model.findOneAndDelete({
                    phone,
                    is_verified: false,
                    status: ACCOUNT_STATUS.PENDING,
                });

                if (deleted) {
                    logger.info(`[Cleanup] Deleted unverified ${entity || "user"}: ${phone}`);
                    return { success: true, phone };
                }

                logger.debug(`[Cleanup] ${entity || "user"} ${phone} already verified or deleted`);
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
        logger.error(`${queueName} error:`, err.message);
    });

    worker.on("failed", (job, err) => {
        logger.error(`${queueName} Job ${job?.id} failed:`, err.message);
    });

    return worker;
};
