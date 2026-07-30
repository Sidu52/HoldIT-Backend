export const key = (...parts) =>
  parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");

export const pattern = (...parts) => key(...parts) + ":*";

/**
 * For admin list/search endpoints with many optional filters (page, limit,
 * status, userId, storeId, sort...). Params are sorted alphabetically so the
 * same filter combo always produces the same key regardless of object order —
 * this MUST stay in sync with how the pattern is derived (see dynamicPattern).
 */
export const dynamicKey = (prefix, params = {}) =>
  key(
    prefix,
    ...Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
  );

// Wildcard match on one filter value inside a dynamicKey, e.g. all
// "bookings:*" entries containing "userId:<id>" anywhere in the key.
export const dynamicFieldPattern = (prefix, field, value) =>
  `${prefix}:*${field}:${value}*`;