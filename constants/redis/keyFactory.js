export const key = (...parts) =>
  parts.filter(p => p !== undefined && p !== null && p !== "").join(":");

export const pattern = (...parts) => key(...parts) + ":*";