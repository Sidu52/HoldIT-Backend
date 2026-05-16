/**
 * Async handler to wrap asynchronous Express route handlers.
 * It automatically catches exceptions and passes them to the next() middleware (errorHandler).
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
