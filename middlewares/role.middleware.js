import { authorize } from "./auth.middleware.js";

/**
 * Re-export authorize for backwards compatibility across existing routes
 */
export const roleMiddleware = authorize;
export default roleMiddleware;
