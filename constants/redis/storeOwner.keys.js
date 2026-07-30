import { key, pattern, dynamicKey } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const StoreOwnerKeys = {
  profile: (ownerId) => key(NS.STORE_OWNER, "profile", ownerId),        // self-service "my profile" — plain owner fields only
  adminDetail: (ownerId) => key(NS.STORE_OWNER, "admin_detail", ownerId), // admin's composed view: owner + stores + counts
  list: (params) => dynamicKey("store_owners", params),                 // admin-only list
  listPattern: () => pattern("store_owners"),

  stores: (ownerId) => key(NS.STORE_OWNER, "stores", ownerId),
  dashboard: (ownerId) => key(NS.STORE_OWNER, "dashboard", ownerId),
  // publicStoreView removed — duplicate of StoreKeys.publicView, per earlier flagged inconsistency; use that instead
};

export const StoreOwnerTTL = Object.freeze({
  PROFILE: 300,
  ADMIN_DETAIL: 120,   // shorter than PROFILE — composed view changes more often (store counts, statuses)
  LIST: 60,
  STORES: 180,
  DASHBOARD: 60,
});