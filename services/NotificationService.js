import logger from "../utils/logger.js";
import sendEmail from "../mailer/emailService.js";

/**
 * Service for handling all system notifications (SMS, Email, Push).
 * Abstracted to easily swap providers later.
 */
class NotificationService {
    /**
     * Sends an OTP to the user's phone.
     * Currently mocks SMS delivery and falls back to a dev email.
     */
    static async sendOTP(phone, otpCode) {
        try {
            // Mock SMS delivery for production readiness
            logger.info(`[NotificationService] Sending SMS to ${phone} with OTP: ${otpCode}`);

            // Development fallback: Send to email
            if (process.env.NODE_ENV !== "test") {
                await sendEmail({
                    to: process.env.DEV_EMAIL_ADDRESS || "alstonsidhu@gmail.com",
                    subject: "Your Holdit OTP Code",
                    template: "otp-verification-email.html",
                    data: {
                        otp_code: otpCode,
                        first_name: "User"
                    },
                    rawFields: ["otp_code"],
                });
            }

            return true;
        } catch (error) {
            logger.error(`[NotificationService] Failed to send OTP to ${phone}: ${error.message}`);
            // We don't throw here so that the auth flow doesn't crash if the notification provider is down.
            // But in a strict production environment, we might want to throw.
            return false;
        }
    }
}

export default NotificationService;
