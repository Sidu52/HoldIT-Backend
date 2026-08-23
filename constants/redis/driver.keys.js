import { key, pattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

const RIDE_HISTORY_PREFIX = "driver_ride_history";

export const DriverKeys = {
  // geo-matching (driverGeoService.js)
  geoByArea: (serviceAreaId) => key("drivers", serviceAreaId),
  geoGlobal: () => key("drivers", "global"),
  meta: (driverId) => key(NS.DRIVER, "meta", driverId),
  offered: (driverId) => key(NS.DRIVER, "offered", driverId),
  history: (driverId) => key(NS.DRIVER, "history", driverId),

  // driver-portal ride state (driver.ride.controller.js)
  assigned: (driverId) => key(NS.DRIVER, "assigned", driverId),
  active: (driverId) => key(NS.DRIVER, "active", driverId),
  activeRide: (driverId) => key(NS.DRIVER, "active", driverId),
  rideDetail: (driverId, bookingId) => key(NS.DRIVER, "ride", driverId, bookingId),
  rideHistory: (driverId, page, limit) => key(RIDE_HISTORY_PREFIX, driverId, page, limit),
  rideHistoryPattern: (driverId) => pattern(RIDE_HISTORY_PREFIX, driverId),

  // driver profile (driver.controller.js)
  profile: (driverId) => key(NS.DRIVER, "profile", driverId),

  // public/user-facing driver view (constants/user/driver.js)
  publicView: (driverId) => key(NS.DRIVER, "public_view", driverId),
  reviews: (driverId, page, limit) => key(NS.DRIVER, "reviews", driverId, page, limit),
  reviewsPattern: (driverId) => pattern(NS.DRIVER, "reviews", driverId),

  // live location & socket
  location: (driverId) => key(NS.DRIVER, "location", driverId),
  socketSession: (driverId) => key(NS.DRIVER, driverId, "socket"),

  // pickup/return OTP rate-limit (driverRideHelper.js)
  otpRateLimit: (driverId, bookingId) => key("rate_limit", "otp", driverId, bookingId),
};

export const DriverTTL = Object.freeze({
  META: 300,
  GEO_META: 3600,
  ASSIGNED: 60,
  ACTIVE: 120,
  ACTIVE_RIDE: 120,
  RIDE_DETAIL: 300,
  RIDE_HISTORY: 120,
  PROFILE: 300,
  PUBLIC_VIEW: 300,
  REVIEWS: 180,
  LOCATION: 300,
  OTP_RATE_LIMIT: 300,
});