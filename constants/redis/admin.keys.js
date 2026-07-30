import { key, pattern, dynamicKey, dynamicFieldPattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const AdminKeys = {
  // ADMIN KEYS
  profile: (id) => key("admin:profile", id),
  teamList: (params) => dynamicKey("admins", params),
  teamListPattern: () => pattern("admins"),

  // DASHBOARD
  dashboardSummary: () => "dashboard:summary",
  dashboardChart: (entity, range, status = "all") =>
    key("dashboard", "chart", entity, range, status),

  area: (areaId) => key("area", areaId),
  areaList: (params) => dynamicKey("areas", params),
  areaListPattern: () => pattern("areas"),

  // BOOKING
  bookingDetail: (bookingId) => key("admin_booking", bookingId),
  bookingList: (params) => dynamicKey("bookings", params),
  bookingListPattern: () => pattern("bookings"),
  bookingListByUserPattern: (userId) => dynamicFieldPattern("bookings", "userId", userId),

  // USER
  userDetail: (userId) => key("admin_user", userId),
  userList: (params) => dynamicKey("users", params),
  userListPattern: () => pattern("users"),

  // Driver
  driverDetail: (driverId) => key("admin_driver", driverId),
  driverList: (params) => dynamicKey("drivers", params),
  driverListPattern: () => pattern("drivers"),


  storeDetail: (storeId) => key("admin_store", storeId),
  storeList: (params) => dynamicKey("stores", params),
  storeListPattern: () => pattern("stores"),

  storeOwnerDetail: (ownerId) => key("admin_store_owner", ownerId),
  storeOwnerList: (params) => dynamicKey("store_owners", params),
  storeOwnerListPattern: () => pattern("store_owners"),
};

export const AdminTTL = Object.freeze({
  INVITE: 3600,
  INVITE_TOKEN: 3600,
  FORGOT_PASSWORD_EXPIRY: 3600,
  PROFILE: 3600,
  TEAM_LIST: 3600,

  SUMMARY: 3600,
  CHART: 7200,
  AREA_LIST: 300,
  AREA_DETAIL: 300,
  BOOKING_LIST: 60,
  BOOKING_DETAIL: 300,
  DRIVER_LIST: 60,
  DRIVER_DETAIL: 300,
  USER_LIST: 60,
  USER_DETAIL: 300,
  STORE_LIST: 60,
  STORE_DETAIL: 300,
  STORE_OWNER_LIST: 60,
  STORE_OWNER_DETAIL: 300,
});