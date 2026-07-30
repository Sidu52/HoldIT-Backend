import { v4 as uuidv4 } from "uuid";
import { generateOTP } from "../../utils/otp.js";
import {
    generateAccessToken,
    generateRefreshToken,
    clearAuthCookies,
} from "../../utils/token.js";
import {
    OTP_MAX_REQUESTS_PER_HOUR,
    TOKEN_TYPES,
} from "../../utils/constants.js";

export { clearAuthCookies };
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { AuthKeys, AuthTTL } from "../../constants/redis/auth.keys.js";
import { getCache, setCache, incrementCache } from "../../constants/redis/redisOperation.js";
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

    
    await setCache(AuthKeys.refreshToken(role, userId, tokenId), "valid", AuthTTL.REFRESH_TOKEN);
    return { accessToken, refreshToken };
};

// OTP HELPERS
export const checkOTPRateLimit = async (role, phone) => {
    const rateLimitKey = AuthKeys.otpRate(role, phone);
    const count = await getCache(rateLimitKey);

    if (count && parseInt(count, 10) >= OTP_MAX_REQUESTS_PER_HOUR) {
        return true;
    }

    await incrementCache(rateLimitKey, OTP_RATE_LIMIT_WINDOW_SECONDS);
    return false;
};

export const generateAndStoreOTP = async (role, phone) => {
    const otp = generateOTP();
    await setCache(AuthKeys.otp(role, phone), otp, AuthTTL.OTP);
    return otp;
};