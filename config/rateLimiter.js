import { RateLimiterRedis } from "rate-limiter-flexible";
import redis from "../services/redisService.js";
import logger from "../utils/logger.js";

// Constants
const BLOCK_DURATION_SECONDS = 300; // 5 minutes
const BLOCK_KEY_PREFIX = "rl:block";

// Limiter Factory
const createLimiter = (keyPrefix, points, duration) =>
  new RateLimiterRedis({
    storeClient: redis,
    keyPrefix,
    points,
    duration,
    blockDuration: 0, // We manage blocks manually for full control
  });

// Role Resolver
const resolveRole = (req) => {
  if (req.user?.role) return req.user.role;

  const segments = req.path.split("/").filter(Boolean);
  const knownRoles = ["user", "driver", "store", "admin"];
  for (const seg of segments) {
    if (knownRoles.includes(seg)) return seg;
  }

  return null;
};

// Identifier Resolver
const resolveIdentifier = (req) =>
  req.body?.phone ||
  req.body?.email ||
  req.user?.auth_id ||
  req.query?.phone ||
  null;

// Block Helpers 
const buildBlockKeys = (identity, ip, prefix) => ({
  identityKey: identity ? `${BLOCK_KEY_PREFIX}:${prefix}:id:${identity}` : null,
  ipKey: `${BLOCK_KEY_PREFIX}:${prefix}:ip:${ip}`,
});

const checkBlocked = async (identityKey, ipKey) => {
  const pipeline = redis.pipeline();
  if (identityKey) pipeline.ttl(identityKey);
  pipeline.ttl(ipKey);

  const results = await pipeline.exec();
  const ttls = results.map(([err, ttl]) => (err ? -2 : ttl));

  if (identityKey) {
    const [idTTL, ipTTL] = ttls;
    if (idTTL > 0) return { blocked: true, ttl: idTTL, reason: "identity" };
    if (ipTTL > 0) return { blocked: true, ttl: ipTTL, reason: "ip" };
  } else {
    const [ipTTL] = ttls;
    if (ipTTL > 0) return { blocked: true, ttl: ipTTL, reason: "ip" };
  }

  return { blocked: false, ttl: 0, reason: null };
};

const applyBlock = async (identityKey, ipKey) => {
  const pipeline = redis.pipeline();
  if (identityKey) pipeline.set(identityKey, "1", "EX", BLOCK_DURATION_SECONDS);
  pipeline.set(ipKey, "1", "EX", BLOCK_DURATION_SECONDS);
  await pipeline.exec();
};

//  Core Middleware Factory 

const rateLimiterMiddleware = (limiter, options = {}) => {
  const { useRole = false, useIdentifier = false, useIP = false } = options;
  const limiterPrefix = limiter.keyPrefix; // e.g. "rl:otp"

  return async (req, res, next) => {
    // Skip rate limiting in development to prevent blocking during local testing
    if (process.env.NODE_ENV === "development") return next();

    try {
      const role = useRole ? resolveRole(req) : null;
      if (useRole && !role) return next();
      const identifier = useIdentifier ? resolveIdentifier(req) : null;
      const { identityKey, ipKey } = buildBlockKeys(
        identifier,
        req.ip,
        limiterPrefix
      );
      const { blocked, ttl, reason } = await checkBlocked(identityKey, ipKey);

      if (blocked) {
        logger.warn(
          `[RateLimiter] Blocked (${reason}) — ${req.method} ${req.path} ` +
          `ip=${req.ip} id=${identifier ?? "n/a"} ttl=${ttl}s`
        );
        return res.status(429).json({
          message: "You are temporarily blocked. Please try again later.",
          retryAfter: ttl,
        });
      }

      const keyParts = [];
      if (useRole && role) keyParts.push(role);
      if (useIdentifier && identifier) keyParts.push(identifier);
      if (useIP) keyParts.push(req.ip);
      // NOTE: No fallback block here — if identifier is null, IP alone is the key.
      // The old fallback was re-adding role+IP a second time (duplicate key bug).

      const consumeKey = keyParts.join(":");

      await limiter.consume(consumeKey);

      return next();
    } catch (err) {
      const identifier = useIdentifier ? resolveIdentifier(req) : null;
      const { identityKey, ipKey } = buildBlockKeys(
        identifier,
        req.ip,
        limiter.keyPrefix
      );

      await applyBlock(identityKey, ipKey).catch((blockErr) =>
        logger.error("[RateLimiter] Failed to apply block:", blockErr)
      );

      logger.warn(
        `[RateLimiter] Limit exceeded — ${req.method} ${req.path} ` +
        `ip=${req.ip} id=${identifier ?? "n/a"} → blocked ${BLOCK_DURATION_SECONDS}s`
      );

      return res.status(429).json({
        message: "Too many requests. You have been blocked for 5 minutes.",
        retryAfter: BLOCK_DURATION_SECONDS,
      });
    }
  };
};

const otpLimiterInstance = createLimiter("rl:otp", 5, 300); // 5  req / 5 min
const loginLimiterInstance = createLimiter("rl:login", 10, 900); // 10 req / 15 min
const refreshLimiterInstance = createLimiter("rl:refresh", 60, 900); // 60 req / 15 min per IP
const apiLimiterInstance = createLimiter("rl:api", 100, 60);  // 100 req / 1 min

// Exported Middleware

export const otpLimiter = rateLimiterMiddleware(otpLimiterInstance, {
  useRole: true,
  useIdentifier: true,
  useIP: false,
});

export const loginLimiter = rateLimiterMiddleware(loginLimiterInstance, {
  useRole: true,
  useIdentifier: true,
  useIP: true,
});

export const refreshLimiter = rateLimiterMiddleware(refreshLimiterInstance, {
  useRole: true,
  useIdentifier: false,
  useIP: true,
});

export const apiLimiter = rateLimiterMiddleware(apiLimiterInstance, {
  useIP: true,
});