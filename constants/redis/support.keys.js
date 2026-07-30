import { key, pattern, dynamicKey } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const SupportKeys = {
  list: (params) => dynamicKey(NS.SUPPORT, params),
  listPattern: () => pattern(NS.SUPPORT),
  detail: (userId, ticketId) => key(NS.SUPPORT, "ticket", userId, ticketId),
};

export const SupportTTL = Object.freeze({
  LIST: 120,
  DETAIL: 300,
});
