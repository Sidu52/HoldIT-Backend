import { v4 as uuidv4 } from "uuid";
import redis, {
    set,
    get,
} from "../../services/redisService.js";
import { generateOTP } from "../../utils/otp.js";
import {
    generateAccessToken,
    generateRefreshToken,
    clearAuthCookies,
} from "../../utils/token.js";
import {
    OTP_EXPIRY,
    OTP_MAX_REQUESTS_PER_HOUR,
    REFRESH_TOKEN_EXPIRY,
    TOKEN_TYPES,
} from "../../utils/constants.js";

export { clearAuthCookies };
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
const OTP_RATE_LIMIT_WINDOW_SECONDS = 60 * 5;

// TIMING SAFE COMPARE
export const timingSafeEqual = (a, b) => {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) return false;
    return cryptoTimingSafeEqual(bufA, bufB);
};

// TOKEN PAIR GENERATION
export const generateTokenPair = async (userId, role, path) => {
    const tokenId = uuidv4();

    const accessToken = generateAccessToken({
        auth_id: userId,
        role: role,
        type: TOKEN_TYPES.ACCESS,
    });

    const refreshToken = generateRefreshToken({
        auth_id: userId,
        role: role,
        token_id: tokenId,
        type: TOKEN_TYPES.REFRESH,
        path,
    });

    await set(
        `refresh:${userId}:${tokenId}`,
        "valid",
        "EX",
        REFRESH_TOKEN_EXPIRY
    );

    return { accessToken, refreshToken };
};

// OTP HELPERS
export const checkOTPRateLimit = async (phone) => {
    const rateLimitKey = `otp_rate:${phone}`;
    const count = await get(rateLimitKey);

    if (count && parseInt(count) >= OTP_MAX_REQUESTS_PER_HOUR) {
        return true;
    }

    await redis
        .multi()
        .incr(rateLimitKey)
        .expire(rateLimitKey, OTP_RATE_LIMIT_WINDOW_SECONDS)
        .exec();

    return false;
};

export const generateAndStoreOTP = async (phone) => {
    const otp = generateOTP();
    const otpKey = `otp:${phone}`;

    await redis
        .multi()
        .del(otpKey)
        .set(otpKey, otp, "EX", OTP_EXPIRY * 60)
        .exec();

    return otp;
};