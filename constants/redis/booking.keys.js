import { key, pattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

const LIST_PREFIX = "user_bookings";
const HISTORY_PREFIX = "user_booking_history";
const ACTIVE_PREFIX = "user_active_bookings";

export const BookingKeys = {
  // user-facing cache
  list: (userId, page, limit, status = "all", sort) =>
    key(LIST_PREFIX, userId, page, limit, status, sort),
  listPattern: (userId) => pattern(LIST_PREFIX, userId),

  userListPattern: (userId) => pattern(LIST_PREFIX, userId),
  userDetail: (userId, bookingId) => key(NS.BOOKING, userId, bookingId),
  detail: (userId, bookingId) => key(NS.BOOKING, userId, bookingId),

  storeDetail: (storeId, bookingId) => key(NS.BOOKING, "store", storeId, bookingId),
  active: (userId) => key(ACTIVE_PREFIX, userId),

  history: (userId, page, limit, sort) => key(HISTORY_PREFIX, userId, page, limit, sort),
  historyPattern: (userId) => pattern(HISTORY_PREFIX, userId),

  // driver-matching / offer state machine
  offer: (bookingId) => key(NS.BOOKING, "offer", bookingId),
  candidates: (bookingId) => key(NS.BOOKING, "candidates", bookingId),
  tried: (bookingId) => key(NS.BOOKING, "tried", bookingId),
  searchActive: (bookingId) => key(NS.BOOKING, "search", "active", bookingId),

  // live tracking (used by src/socket/services/location.service.js)
  activeDriver: (bookingId) => key(NS.BOOKING, "active_driver", bookingId),
  driverForBooking: (bookingId) => key(NS.BOOKING, "driver", bookingId),
};

export const BookingTTL = Object.freeze({
  LIST: 60,
  DETAIL: 120,
  ACTIVE: 60,
  HISTORY: 120,
  OFFER: 70,
  CANDIDATES: 600,
  TRIED_DRIVERS: 600,
  SEARCH_ACTIVE: 600,
  ACTIVE_DRIVER: 21600,
  DRIVER_FOR_BOOKING: 86400,
});