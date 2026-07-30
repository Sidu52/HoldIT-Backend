import { key, pattern } from "./keyFactory.js";
import { NS } from "./namespaces.js";

/**
 * Shared by User / Driver / Store / StoreOwner / Admin auth flows.
 * `role` MUST be passed (NS.USER, NS.DRIVER, NS.STORE, NS.STORE_OWNER, NS.ADMIN)
 * so the same phone/email can't collide across actor types.
 */
export const AuthKeys = {
  otp: (role, phone) => key(NS.AUTH, role, "otp", phone),
  otpFail: (role, phone) => key(NS.AUTH, role, "otp_fail", phone),
  otpCooldown: (role, phone) => key(NS.AUTH, role, "otp_cooldown", phone),
  otpRate: (role, phone) => key(NS.AUTH, role, "otp_rate", phone),

  pendingUser: (phone) => key(NS.AUTH, NS.USER, "pending", phone),
  pendingOwner: (phone) => key(NS.AUTH, NS.STORE_OWNER, "pending", phone),

  refreshToken: (role, authId, tokenId) => key(NS.AUTH, role, "refresh", authId, tokenId),
  refreshTokenPattern: (role, authId) => pattern(NS.AUTH, role, "refresh", authId),

  accessToken: (role, authId, tokenId) => key(NS.AUTH, role, "access", authId, tokenId),
  accessTokenPattern: (role, authId) => pattern(NS.AUTH, role, "access", authId),

  adminInviteToken: (token) => key(NS.AUTH, NS.ADMIN, "invite", "token", token),
  adminInviteEmail: (email) => key(NS.AUTH, NS.ADMIN, "invite", "email", email),
  adminForgotToken: (token) => key(NS.AUTH, NS.ADMIN, "forgot", "token", token),
  adminForgotEmail: (email) => key(NS.AUTH, NS.ADMIN, "forgot", "email", email),
};

export const AuthTTL = Object.freeze({
  OTP: 300,
  OTP_COOLDOWN: 60,
  OTP_FAIL_WINDOW: 15 * 60,
  PENDING_USER: 20 * 60,
  REFRESH_TOKEN: 7 * 24 * 60 * 60,
});