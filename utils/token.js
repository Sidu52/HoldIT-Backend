import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from "./constants.js";

export const generateAccessToken = (user) => {
  return jwt.sign(
    { auth_id: user.auth_id, role: user.role, type: user.type },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: `${ACCESS_TOKEN_EXPIRY}m` }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    { auth_id: user.auth_id, token_id: user.token_id, type: user.type },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY}d` }
  );
};
