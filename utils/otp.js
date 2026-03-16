export const generateOTP = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

// import crypto from "crypto";

// const OTP_LENGTH = 6; // 6-digit OTP

// export const generateOTP = () => {
//   const min = Math.pow(10, OTP_LENGTH - 1);       // 100000
//   const max = Math.pow(10, OTP_LENGTH);            // 1000000
//   return crypto.randomInt(min, max).toString();
// };