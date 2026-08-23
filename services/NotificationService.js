import logger from "../utils/logger.js";
import sendEmail from "../mailer/emailService.js";
import User from "../models/User.js";
import Driver from "../models/Driver.js";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

class NotificationService {
    static async sendOTP(phone, otpCode) {
        try {
            logger.info(`[NotificationService] Sending SMS to ${phone} with OTP: ${otpCode}`);
            // Development fallback: Send to email
            if (process.env.NODE_ENV !== "test") {
                sendEmail({
                    to: process.env.DEV_EMAIL_ADDRESS || "alstonsidhu@gmail.com",
                    subject: "Your Holdit OTP Code",
                    template: "otp-verification-email.html",
                    data: {
                        otp_code: otpCode,
                        first_name: "User"
                    },
                    rawFields: ["otp_code"],
                }).catch((err) => logger.error(`[NotificationService] Background email failed: ${err.message}`));
            }
            return true;
        } catch (error) {
            logger.error(`[NotificationService] Failed to send OTP to ${phone}: ${error.message}`);
            return false;
        }
    }

    /**
     * Send Push Notification via Expo Push API
     * @param {Object} params
     * @param {string|string[]} params.to - Expo push token(s)
     * @param {string} params.title - Notification title
     * @param {string} params.body - Notification body text
     * @param {Object} [params.data] - Custom metadata payload
     * @param {string} [params.sound='default'] - Sound to play
     * @param {string} [params.priority='high'] - Priority ('default' | 'normal' | 'high')
     * @param {string} [params.channelId='default'] - Android channel ID
     */
    static async sendExpoPushNotification({
        to,
        title,
        body,
        data = {},
        sound = "default",
        priority = "high",
        channelId = "default",
    }) {
        if (!to || (Array.isArray(to) && to.length === 0)) {
            logger.warn("[NotificationService] No push token provided for notification");
            return false;
        }

        const tokens = Array.isArray(to) ? to : [to];
        const validTokens = tokens.filter(
            (t) => typeof t === "string" && (t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"))
        );

        if (validTokens.length === 0) {
            logger.warn(`[NotificationService] No valid Expo push tokens found in: ${JSON.stringify(to)}`);
            return false;
        }

        const messages = validTokens.map((token) => ({
            to: token,
            sound,
            title,
            body,
            data,
            priority,
            channelId,
        }));

        try {
            const response = await fetch(EXPO_PUSH_API_URL, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(messages),
            });

            const result = await response.json();
            logger.info(`[NotificationService] Push notification sent to ${validTokens.length} recipient(s): ${title}`);
            return result;
        } catch (error) {
            logger.error(`[NotificationService] Error sending Expo push notification: ${error.message}`);
            return false;
        }
    }

    /**
     * Send push notification to a specific User
     * @param {string} userId 
     * @param {Object} notification - { title, body, data }
     */
    static async sendPushToUser(userId, { title, body, data = {} }) {
        if (!userId) return false;
        try {
            const user = await User.findById(userId).select("push_token").lean();
            if (!user?.push_token) {
                logger.debug(`[NotificationService] User ${userId} has no registered push_token`);
                return false;
            }
            return await this.sendExpoPushNotification({
                to: user.push_token,
                title,
                body,
                data,
            });
        } catch (error) {
            logger.error(`[NotificationService] sendPushToUser failed for ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Send push notification to a specific Driver
     * @param {string} driverId 
     * @param {Object} notification - { title, body, data }
     */
    static async sendPushToDriver(driverId, { title, body, data = {} }) {
        if (!driverId) return false;
        try {
            const driver = await Driver.findById(driverId).select("push_token").lean();
            if (!driver?.push_token) {
                logger.debug(`[NotificationService] Driver ${driverId} has no registered push_token`);
                return false;
            }
            return await this.sendExpoPushNotification({
                to: driver.push_token,
                title,
                body,
                data,
            });
        } catch (error) {
            logger.error(`[NotificationService] sendPushToDriver failed for ${driverId}: ${error.message}`);
            return false;
        }
    }
}

export default NotificationService;
