import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from "./constants.js";

const accessSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

if (!accessSecret || !refreshSecret) {
  throw new Error("Token secrets must be defined in environment variables");
}

export const generateAccessToken = (user) => {
  if (!user?.auth_id || !user?.type) {
    throw new Error("Missing required user fields for access token");
  }
  return jwt.sign(
    { auth_id: user.auth_id, type: user.type },
    accessSecret,
    { expiresIn: `${ACCESS_TOKEN_EXPIRY}m` }
  );
};

export const generateRefreshToken = (user) => {
  if (!user?.auth_id || !user?.token_id || !user?.type) {
    throw new Error("Missing required user fields for refresh token");
  }
  return jwt.sign(
    { auth_id: user.auth_id, token_id: user.token_id, type: user.type },
    refreshSecret,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY}d` }
  );
};