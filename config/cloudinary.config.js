import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
    logger.warn("[Cloudinary] Cloudinary credentials missing in environment variables. Uploads will fail until configured.");
} else {
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });
    logger.info("✅ [Cloudinary] Initialized successfully");
}

export default cloudinary;
