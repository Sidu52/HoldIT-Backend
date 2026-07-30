
import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error(
    "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be defined"
  );
}

const ACCESS_EXPIRY = "1h";
const REFRESH_EXPIRY = "7d";

// COOKIE CONFIG
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

const ACCESS_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 60 * 60 * 1000, // 1 hour
};

const REFRESH_COOKIE_OPTIONS = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};


// GENERATE Access Token
export const generateAccessToken = ({ auth_id, role, type }) => {
  if (!auth_id || !role) throw new Error("Missing required fields for access token");
  return jwt.sign({ auth_id, role, type: type || "access" }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
};

export const generateRefreshToken = ({ auth_id, role, token_id, session_id, path }) => {
  if (!auth_id || !role) throw new Error("Missing required fields for refresh token");
  // Accept either token_id (preferred) or session_id (legacy alias)
  const resolvedTokenId = token_id || session_id || crypto.randomUUID();
  const payload = {
    auth_id,
    role,
    token_id: resolvedTokenId,
    type: "refresh",
  };
  if (path) {
    payload.path = path;
  }
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
};

// VERIFY TOKENS
export const verifyAccessToken = (token) => jwt.verify(token, ACCESS_SECRET);
export const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_SECRET);

// GENERATE TOKEN PAIR 
export const generateTokenPair = (userOrAuth, session_id, path) => {
  const isTokenPayload =
    userOrAuth &&
    typeof userOrAuth === "object" &&
    !Array.isArray(userOrAuth) &&
    "auth_id" in userOrAuth &&
    "role" in userOrAuth;

  if (isTokenPayload) {
    const accessToken = generateAccessToken(userOrAuth);
    const refreshToken = generateRefreshToken({ ...userOrAuth, session_id });
    return { accessToken, refreshToken };
  }

  const auth_id = userOrAuth;
  const role = session_id;
  const refreshPath = path || "/";

  const accessToken = generateAccessToken({ auth_id, role, type: "access" });
  const refreshToken = generateRefreshToken({ auth_id, role, path: refreshPath });
  return { accessToken, refreshToken };
};

// COOKIE OPERATIONS
const getCookieNames = (path = "") => {
  if (path.includes("/admin")) {
    return { access: "admin_accessToken", refresh: "admin_refreshToken" };
  }
  return { access: "accessToken", refresh: "refreshToken" };
};

export const setAuthCookies = (res, accessToken, refreshToken, refreshCookiePath = "/") => {
  const names = getCookieNames(refreshCookiePath);

  res.cookie(names.access, accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie(
    names.refresh,
    refreshToken,
    {
      ...REFRESH_COOKIE_OPTIONS,
      path: refreshCookiePath,
    }
  );

  const hasSessionName = refreshCookiePath.includes("/admin") ? "admin_hasSession" : "hasSession";
  res.cookie(hasSessionName, "true", {
    ...ACCESS_COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: REFRESH_COOKIE_OPTIONS.maxAge,
  });
};

export const clearAuthCookies = (res, refreshCookiePath = "/") => {
  const refreshPaths = new Set([
    "/",
    refreshCookiePath,
    "/api/v1/admin/auth/refresh",
    "/api/v1/store/auth/refresh",
    "/api/v1/store-owner/auth/refresh",
    "/api/v1/driver/auth/refresh",
    "/api/v1/user/auth/refresh",
  ]);

  res.clearCookie("accessToken", { ...BASE_COOKIE_OPTIONS, path: "/" });
  res.clearCookie("admin_accessToken", { ...BASE_COOKIE_OPTIONS, path: "/" });
  res.clearCookie("hasSession", { ...BASE_COOKIE_OPTIONS, path: "/" });
  res.clearCookie("admin_hasSession", { ...BASE_COOKIE_OPTIONS, path: "/" });

  refreshPaths.forEach((path) => {
    res.clearCookie("refreshToken", { ...BASE_COOKIE_OPTIONS, path });
    res.clearCookie("admin_refreshToken", { ...BASE_COOKIE_OPTIONS, path });
  });
};