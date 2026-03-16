import { Worker } from "bullmq";
import { redisConnectionConfig } from "../services/redisService.js";
import User from "../models/User.js";
import { JOB_QUEUES } from "../utils/constants.js";

let worker;

export const createDeleteUnverifiedUserWorker = () => {
    worker = new Worker(
         JOB_QUEUES.DELETE_UNVERIFIED_USER,
        async (job) => {
            const { phone } = job.data;

            if (!phone) {
                return { success: false, reason: "missing_phone" };
            }

            const deletedUser = await User.findOneAndDelete({
                phone,
                isVerified: false,
                status: "PENDING",
            });

            if (deletedUser) {
                console.log(`Deleted unverified user: ${phone}`);
                return { success: true, phone };
            }

            console.log(`User ${phone} already verified or deleted`);
            return { success: true, reason: "already_handled" };
        },
        {
            connection: redisConnectionConfig,
            concurrency: 5,
        }
    );

    worker.on("error", (err) => {
        console.error("deleteUnverifiedUserWorker error:", err.message);
    });

    return worker;
};

export const getWorker = () => worker;
