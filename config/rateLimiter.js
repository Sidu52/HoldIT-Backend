import { RateLimiterRedis } from "rate-limiter-flexible";
import redis from "../services/redisService.js";

// // Helper: create limiter instance
// const createLimiter = (keyPrefix, points, duration) =>
//   new RateLimiterRedis({
//     storeClient: redis,
//     keyPrefix,
//     points,
//     duration
//   });

// // Helper: Express middleware wrapper
// const rateLimiterMiddleware = (limiter) => {
//   return async (req, res, next) => {
//     try {
//       // Use IP or phone for OTP
//       const key = req.ip;
//       const { role } = req.user
//       await limiter.consume(key);

//       next();
//     } catch (err) {
//       res.status(429).json({
//         message: "Too many requests, please try again later"
//       });
//     }
//   };
// };

// // Create limiters
// const otpLimiterInstance = createLimiter("rl:otp", 3, 300);
// const loginLimiterInstance = createLimiter("rl:login", 10, 900);
// const refreshLimiterInstance = createLimiter("rl:refresh", 20, 900);
// // Default API limiter
// const apiLimiterInstance = createLimiter("rl:api", 100, 60);// 100 requests per minute

// export const otpLimiter = rateLimiterMiddleware(otpLimiterInstance);
// export const loginLimiter = rateLimiterMiddleware(loginLimiterInstance);
// export const refreshLimiter = rateLimiterMiddleware(refreshLimiterInstance);
// export const apiLimiter = rateLimiterMiddleware(apiLimiterInstance);



/**
 * Create limiter instance
 */
const createLimiter = (keyPrefix, points, duration) =>
  new RateLimiterRedis({
    storeClient: redis,
    keyPrefix,
    points,
    duration,
  });

/**
 * Resolve role safely
 */
const resolveRole = (req) => {
  // 1️⃣ From JWT (after auth middleware)
  if (req.user?.role) return req.user.role;

  // 2️⃣ From URL (OTP routes)
  const base = req.baseUrl.split("/")[1];
  if (base) return base;

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
        return res.status(400).json({
          message: "Role not found for rate limiting",
        });
      }

      // Identifier: phone/email/auth_id
      const identifier =
        req.body?.phone ||
        req.body?.email ||
        req.user?.auth_id ||
        req.query.phone


      if (useIdentifier && !identifier) {
        return res.status(400).json({
          message: "Identifier missing for rate limiting",
        });
      }

      const keyParts = [];

      if (useRole) keyParts.push(role);
      if (useIdentifier) keyParts.push(identifier);
      if (useIP) keyParts.push(req.ip);

      const key = keyParts.join(":");

      await limiter.consume(key);

      next();
    } catch (err) {
      console.log(err);
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
const apiLimiterInstance = createLimiter("rl:api", 100, 60);      // 100 req / min



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