import { key } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const OpsKeys = {
  criticalCancellation: (bookingId) => key(NS.OPS, "critical_cancellation", bookingId),
  driverLock: (driverId) => key(NS.DRIVER, "offered", driverId),
};

export const OpsTTL = Object.freeze({
  CRITICAL_CANCELLATION: 86400,
  DRIVER_LOCK: 70, // Re-using from old configuration
});
