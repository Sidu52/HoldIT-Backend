import { key, pattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const UserKeys = {

  profile: (userId) => key(NS.USER, "profile", userId),

  // addresses (constants/user/address.js)
  addressList: (userId) => key(NS.USER, "addresses", userId),
  addressDetail: (userId, addressId) => key(NS.USER, userId, "address", addressId),

  // payment lock (payment.controller.js — verify this is a lock, not a cache read)
  paymentLock: (userId) => key(NS.USER, "payment_lock", userId),
};

export const UserTTL = Object.freeze({
  PROFILE: 300,
  PENDING_USER: 300,
  ADDRESS_LIST: 120,
  ADDRESS_DETAIL: 300,
  PAYMENT_LOCK: 30,
});