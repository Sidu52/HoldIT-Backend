import { RateLimiterRedis } from "rate-limiter-flexible";
import redis from "../services/redisService.js";
import logger from "../utils/logger.js";


const createLimiter = (keyPrefix, points, duration) =>
  new RateLimiterRedis({
    storeClient: redis,
    keyPrefix,
    points,
    duration,
  });


/**
 * Resolve the requester's role for use as a rate limit key segment.
 * Priority: decoded JWT role → route path prefix → null
 */
const resolveRole = (req) => {
  if (req.user?.role) return req.user.role;

  // Infer role from the URL path (e.g. /api/user/... → "user")
  const segments = req.path.split("/").filter(Boolean);
  const knownRoles = ["user", "driver", "store", "admin"];
  for (const seg of segments) {
    if (knownRoles.includes(seg)) return seg;
  }

  return null;
};

/**
 * Generic rate limiter middleware
 */
const rateLimiterMiddleware = (limiter, options) => {
  return async (req, res, next) => {
    try {
      const { useRole, useIdentifier, useIP } = options;

      const role = useRole ? resolveRole(req) : null;

      if (useRole && !role) {
        // Don't block the request, just skip role-keying
        return next();
      }

      // Identifier: phone/email/auth_id
      const identifier =
        req.body?.phone ||
        req.body?.email ||
        req.user?.auth_id ||
        req.query?.phone;

      if (useIdentifier && !identifier) {
        // Fall back to IP so the limiter still works
        const fallbackKey = [role, req.ip].filter(Boolean).join(":");
        await limiter.consume(fallbackKey);
        return next();
      }

      const keyParts = [];
      if (useRole) keyParts.push(role);
      if (useIdentifier) keyParts.push(identifier);
      if (useIP) keyParts.push(req.ip);

      const key = keyParts.join(":");
      await limiter.consume(key);

      next();
    } catch (err) {
      logger.warn(`[RateLimiter] Limit hit — ${req.method} ${req.path} from ${req.ip}`);
      return res.status(429).json({
        message: "Too many requests, please try again later",
      });
    }
  };
};

/**
 * Limiter instances
 */
const otpLimiterInstance = createLimiter("rl:otp", 3, 300);
const loginLimiterInstance = createLimiter("rl:login", 10, 900);
const refreshLimiterInstance = createLimiter("rl:refresh", 20, 900);
const apiLimiterInstance = createLimiter("rl:api", 100, 60); 



// OTP → NO JWT, role from route
export const otpLimiter = rateLimiterMiddleware(otpLimiterInstance, {
  useRole: true,
  useIdentifier: true,
  useIP: false,
});

// Login → email/password
export const loginLimiter = rateLimiterMiddleware(loginLimiterInstance, {
  useRole: true,
  useIdentifier: true,
  useIP: true,
});

// Refresh → JWT present
export const refreshLimiter = rateLimiterMiddleware(refreshLimiterInstance, {
  useRole: true,
  useIdentifier: true, // auth_id from JWT
  useIP: true,
});

// Api Limiter
export const apiLimiter = rateLimiterMiddleware(apiLimiterInstance, {
  useIP: true,
});