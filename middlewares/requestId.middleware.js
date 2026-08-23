import { randomUUID } from "crypto";

/**
 * Middleware to ensure every incoming HTTP request has a unique Correlation ID.
 * Attaches x-request-id to request object and response headers for distributed tracing.
 */
export const requestIdMiddleware = (req, res, next) => {
    const existingId = req.headers["x-request-id"];
    const requestId = existingId && typeof existingId === "string" ? existingId : randomUUID();

    req.id = requestId;
    res.setHeader("x-request-id", requestId);

    next();
};
