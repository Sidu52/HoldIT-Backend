import { createAutoCancelWorker } from "./autoCancelWorker.js";
import { createDeleteUnverifiedUserWorker } from "./deleteUnverifiedUserWorker.js";
import { createDriverAssignWorker } from "./jobs/driverSearchJob.js";
export const initializeWorkers = () => {
    createAutoCancelWorker();
    createDeleteUnverifiedUserWorker();
    createDriverAssignWorker();
};