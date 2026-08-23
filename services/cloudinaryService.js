import cloudinary from "../config/cloudinary.config.js";
import logger from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import { CLOUDINARY_FOLDERS } from "../constants/cloudinary.folders.js";

/**
 * Uploads a single file buffer to Cloudinary via stream
 *
 * @param {Buffer} buffer - File buffer from Multer memory storage
 * @param {Object} options - Custom Cloudinary options
 * @param {string} options.folder - Destination folder in Cloudinary
 * @param {string} [options.publicId] - Optional custom public ID
 * @param {string} [options.resourceType="auto"] - "image" | "raw" | "auto"
 * @param {Array<Object>} [options.transformations] - Cloudinary transformation pipeline
 * @returns {Promise<Object>} Cloudinary upload result
 */
export const uploadBufferToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        if (!buffer || !Buffer.isBuffer(buffer)) {
            return reject(new Error("Invalid buffer provided for Cloudinary upload"));
        }

        const folder = options.folder || CLOUDINARY_FOLDERS.GENERAL;
        const publicId = options.publicId || `${uuidv4()}`;
        const resourceType = options.resourceType || "auto";

        const uploadOptions = {
            folder,
            public_id: publicId,
            resource_type: resourceType,
            overwrite: options.overwrite !== false,
            // Automatic optimization
            fetch_format: "auto",
            quality: "auto",
            tags: ["holdit", folder.replace(/^holdit\/?/, "")],
            ...options.cloudinaryOptions,
        };

        if (options.transformation) {
            uploadOptions.transformation = options.transformation;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    logger.error(`[CloudinaryService] Upload failed for folder ${folder}: ${error.message}`);
                    return reject(error);
                }
                logger.info(`[CloudinaryService] Uploaded successfully: ${result.secure_url} (${result.bytes} bytes)`);
                resolve(result);
            }
        );

        uploadStream.end(buffer);
    });
};

/**
 * Uploads multiple file buffers concurrently to Cloudinary
 *
 * @param {Array<Express.Multer.File>} files - Array of multer file objects
 * @param {Object} options - Options passed to uploadBufferToCloudinary
 * @returns {Promise<Array<Object>>} Array of Cloudinary upload results
 */
export const uploadMultipleBuffers = async (files = [], options = {}) => {
    if (!Array.isArray(files) || files.length === 0) {
        return [];
    }

    const uploadPromises = files.map((file, index) => {
        const filePublicId = options.publicId
            ? `${options.publicId}_${index + 1}`
            : undefined;

        return uploadBufferToCloudinary(file.buffer, {
            ...options,
            publicId: filePublicId,
        });
    });

    return Promise.all(uploadPromises);
};

/**
 * Deletes a file from Cloudinary by public ID
 *
 * @param {string} publicId - The Cloudinary public ID
 * @param {string} [resourceType="image"] - "image" | "raw" | "video"
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFromCloudinary = async (publicId, resourceType = "image") => {
    if (!publicId) return { result: "not_found" };

    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            invalidate: true,
        });
        logger.info(`[CloudinaryService] Deleted asset: ${publicId} (Result: ${result.result})`);
        return result;
    } catch (err) {
        logger.error(`[CloudinaryService] Delete failed for ${publicId}: ${err.message}`);
        throw err;
    }
};

/**
 * Deletes multiple files from Cloudinary
 *
 * @param {Array<string>} publicIds - List of Cloudinary public IDs
 * @returns {Promise<Object>} Batch deletion result
 */
export const deleteMultipleFromCloudinary = async (publicIds = []) => {
    if (!publicIds.length) return { deleted: {} };

    try {
        const result = await cloudinary.api.delete_resources(publicIds, {
            invalidate: true,
        });
        return result;
    } catch (err) {
        logger.error(`[CloudinaryService] Batch delete failed: ${err.message}`);
        throw err;
    }
};

/**
 * Helper to extract the public ID from a Cloudinary URL
 *
 * @param {string} url - Full Cloudinary URL
 * @returns {string|null} The public ID or null
 */
export const extractPublicIdFromUrl = (url) => {
    if (!url || typeof url !== "string" || !url.includes("cloudinary.com")) {
        return null;
    }

    try {
        // e.g. https://res.cloudinary.com/demo/image/upload/v1234567890/holdit/users/avatars/abc.webp
        const parts = url.split("/upload/");
        if (parts.length < 2) return null;

        let afterUpload = parts[1];
        // Remove version if present (e.g. v1234567890/)
        afterUpload = afterUpload.replace(/^v\d+\//, "");

        // Remove extension (e.g. .webp, .jpg)
        const publicIdWithFolder = afterUpload.substring(0, afterUpload.lastIndexOf(".")) || afterUpload;
        return publicIdWithFolder;
    } catch (err) {
        logger.warn(`[CloudinaryService] Failed to extract public_id from URL: ${url}`);
        return null;
    }
};
