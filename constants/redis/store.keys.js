// storeKeys.js
import { key, pattern, dynamicKey, dynamicFieldPattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const StoreKeys = {
  geoByArea: (serviceAreaId) => key("stores", serviceAreaId),
  meta: (storeId) => key(NS.STORE, "meta", storeId),

  profile: (storeId) => key(NS.STORE, "profile", storeId),
  dashboard: (storeId) => key(NS.STORE, "dashboard", storeId),

  search: (query, page, limit, sort) => key("stores_search", query, page, limit, sort),
  searchPattern: () => pattern("stores_search"),

  nearby: (lat, lng, radius, page, limit) => key("stores_nearby", lat, lng, radius, page, limit),
  nearbyPattern: () => pattern("stores_nearby"),

  nearest: (lat, lng) => key("nearest_stores", lat.toFixed(2), lng.toFixed(2)),
  nearestPattern: () => pattern("nearest_stores"),

  detail: (storeId) => key(NS.STORE, "detail", storeId),
  availability: (storeId) => key(NS.STORE, "availability", storeId),
  publicView: (storeId) => key(NS.STORE, "public", storeId),

  // ── NEW: store-scoped booking caches ──────────────────────────

  bookingSummary: (storeId) => key(NS.STORE, "booking_summary", storeId),

  bookingIncoming: (storeId) => key(NS.STORE, "bookings_incoming", storeId),
  bookingReturnParcel: (storeId) => key(NS.STORE, "booking_return_parcel", storeId),
  bookingActive: (storeId, params) => dynamicKey("store_bookings_active", { storeId, ...params }),
  bookingActiveByStorePattern: (storeId) => dynamicFieldPattern("store_bookings_active", "storeId", storeId),

  bookingHistory: (storeId, params) => dynamicKey("store_bookings_history", { storeId, ...params }),
  bookingHistoryByStorePattern: (storeId) => dynamicFieldPattern("store_bookings_history", "storeId", storeId),

  bookingDetail: (storeId, bookingId) => key(NS.STORE, "booking_detail", storeId, bookingId),
};

export const StoreTTL = Object.freeze({
  META: 300,
  PROFILE: 180,
  DASHBOARD: 60,
  SEARCH: 120,
  NEARBY: 60,
  NEAREST: 60,
  DETAIL: 300,
  AVAILABILITY: 30,
  PUBLIC_VIEW: 300,

  // ── NEW ────────────────────────────────────────────────────────
  BOOKING_INCOMING: 15,   // status changes rapidly (driver assignment flow)
  BOOKING_ACTIVE: 30,
  BOOKING_HISTORY: 300,   // delivered/cancelled — effectively immutable
  BOOKING_DETAIL: 30,
});