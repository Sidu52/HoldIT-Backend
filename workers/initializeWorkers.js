import { createAutoCancelWorker } from "./autoCancelWorker.js";
import { createDeleteUnverifiedWorker } from "./deleteUnverifiedAccountWorker.js";
import { JOB_QUEUES } from "../utils/constants.js";
import { createDriverAssignWorker } from "./jobs/driverSearchJob.js";
import { createReturnProcessWorker } from "./returnProcessWorker.js";
import logger from "../utils/logger.js";


const activeWorkers = [];

export const initializeWorkers = () => {
    activeWorkers.push(createAutoCancelWorker());
    activeWorkers.push(createDeleteUnverifiedWorker(JOB_QUEUES.DELETE_UNVERIFIED_USER));
    activeWorkers.push(createDeleteUnverifiedWorker(JOB_QUEUES.DELETE_UNVERIFIED_DRIVER));
    activeWorkers.push(createDeleteUnverifiedWorker(JOB_QUEUES.DELETE_UNVERIFIED_STORE));
    activeWorkers.push(createDriverAssignWorker());
    activeWorkers.push(createReturnProcessWorker());
};

export const closeAllWorkers = async () => {
    logger.info(`[Workers] Closing ${activeWorkers.length} workers...`);
    await Promise.allSettled(activeWorkers.map((w) => w.close()));
    logger.info("[Workers] All workers gracefully closed.");
};