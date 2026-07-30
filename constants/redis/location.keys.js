import { key } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const LocationKeys = {
  driverLocation: (driverId) => key(NS.DRIVER, "location", driverId),
  bookingDriver: (bookingId) => key(NS.BOOKING, "driver", bookingId),
  activeDriverAuth: (bookingId) => key(NS.BOOKING, "active_driver", bookingId),
  locationMonitorLock: () => key("lock", "location_monitor"),
};

export const LocationTTL = Object.freeze({
  DRIVER_LOCATION: 300,
  BOOKING_DRIVER: 86400,
  ACTIVE_DRIVER_AUTH: 21600,
  MONITOR_LOCK: 55,
});
