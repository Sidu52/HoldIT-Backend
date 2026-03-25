import crypto from "crypto";

export const generateOTP = () => crypto.randomInt(1000, 10000).toString();