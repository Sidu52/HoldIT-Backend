import { key, pattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

const LIST_PREFIX = "user_bookings";
const HISTORY_PREFIX = "user_booking_history";
const ACTIVE_PREFIX = "user_active_bookings";

export const BookingKeys = {
    list: (userId, page, limit, status = "all", sort) =>
        key(LIST_PREFIX, userId, page, limit, status, sort),
    listPattern: (userId) => pattern(LIST_PREFIX, userId),

    detail: (userId, bookingId) => key(NS.BOOKING, userId, bookingId),

    active: (userId) => key(ACTIVE_PREFIX, userId),

    history: (userId, page, limit, sort) =>
        key(HISTORY_PREFIX, userId, page, limit, sort),
    historyPattern: (userId) => pattern(HISTORY_PREFIX, userId),

    offer: (bookingId) => key(NS.BOOKING, "offer", bookingId),
    candidates: (bookingId) => key(NS.BOOKING, "candidates", bookingId),
    tried: (bookingId) => key(NS.BOOKING, "tried", bookingId),
    searchActive: (bookingId) => key(NS.BOOKING, "search", "active", bookingId),
};

export const BookingTTL = Object.freeze({
    LIST: 60,
    DETAIL: 120,
    ACTIVE: 60,
    HISTORY: 120,
});