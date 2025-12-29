
import { deleteUnverifiedUserWorker } from "./deleteUnverifiedUserWorker.js";
import { driverAssignWorker } from "./driverAssignWorker.js";
import { storeAssignWorker } from "./storeAssignWorker.js";

export const initializeWorkers = () => {
  deleteUnverifiedUserWorker;
  driverAssignWorker;
  storeAssignWorker;
};
