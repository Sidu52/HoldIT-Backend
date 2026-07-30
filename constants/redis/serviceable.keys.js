import { key, pattern, dynamicKey } from "./keyFactory.js";
import { NS } from "./namespaces.js";

export const ServiceableKeys = {
    detail: (areaId) => key(NS.AREA ?? "area", areaId),
    list: (params) => dynamicKey("areas", params),
    listPattern: () => pattern("areas"),
};

export const ServiceableTTL = Object.freeze({
    DETAIL: 300,   // areas change rarely — safe to cache longer
    LIST: 120,
});