import { createAutoCancelWorker } from "./autoCancelWorker.js";
import { createDeleteUnverifiedUserWorker } from "./deleteUnverifiedUserWorker.js";
import { createDriverAssignWorker } from "./jobs/driverSearchJob.js";
import logger from "../utils/logger.js";


const activeWorkers = [];

export const initializeWorkers = () => {
    activeWorkers.push(createAutoCancelWorker());
    activeWorkers.push(createDeleteUnverifiedUserWorker());
    activeWorkers.push(createDriverAssignWorker());
};

export const closeAllWorkers = async () => {
    logger.info(`[Workers] Closing ${activeWorkers.length} workers...`);
    await Promise.allSettled(activeWorkers.map((w) => w.close()));
    logger.info("[Workers] All workers gracefully closed.");
};