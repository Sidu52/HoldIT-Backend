import multer from "multer";
import { UPLOAD_LIMITS } from "../constants/cloudinary.folders.js";
import { sendError } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";

// Memory storage keeps files in RAM buffers for immediate streaming to Cloudinary
const memoryStorage = multer.memoryStorage();

/**
 * Creates a generic file filter based on allowed MIME types
 */
const createFileFilter = (allowedMimes = UPLOAD_LIMITS.ALLOWED_IMAGE_MIMES) => {
    return (req, file, cb) => {
        if (!file) {
            return cb(null, false);
        }

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            const error = new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimes.join(", ")}`);
            error.code = "INVALID_FILE_TYPE";
            cb(error, false);
        }
    };
};

/**
 * Configures a Multer instance with customized size and type limits
 */
export const createMulterUpload = ({
    maxSizeMB = UPLOAD_LIMITS.PHOTO_MAX_SIZE_MB,
    allowedMimes = UPLOAD_LIMITS.ALLOWED_IMAGE_MIMES,
    maxFiles = 5,
} = {}) => {
    return multer({
        storage: memoryStorage,
        fileFilter: createFileFilter(allowedMimes),
        limits: {
            fileSize: maxSizeMB * 1024 * 1024,
            files: maxFiles,
        },
    });
};

/**
 * Express error handler middleware specifically for Multer upload errors
 */
export const handleUploadError = (err, req, res, next) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return sendError(
                res,
                `File too large. Maximum allowed file size is restricted.`,
                STATUS_CODES.BAD_REQUEST
            );
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return sendError(
                res,
                `Too many files uploaded at once. Maximum allowed is restricted.`,
                STATUS_CODES.BAD_REQUEST
            );
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return sendError(
                res,
                `Unexpected upload field: '${err.field || "unknown"}'.`,
                STATUS_CODES.BAD_REQUEST
            );
        }
        return sendError(res, `Upload error: ${err.message}`, STATUS_CODES.BAD_REQUEST);
    }

    if (err.code === "INVALID_FILE_TYPE") {
        return sendError(res, err.message, STATUS_CODES.BAD_REQUEST);
    }

    next(err);
};

/**
 * Middleware factory for single image upload
 */
export const uploadSingleImage = (fieldName = "photo", options = {}) => {
    const uploadInstance = createMulterUpload({
        maxSizeMB: options.maxSizeMB || UPLOAD_LIMITS.PHOTO_MAX_SIZE_MB,
        allowedMimes: options.allowedMimes || UPLOAD_LIMITS.ALLOWED_IMAGE_MIMES,
        maxFiles: 1,
    });

    return (req, res, next) => {
        uploadInstance.single(fieldName)(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    };
};

/**
 * Middleware factory for multiple images upload
 */
export const uploadMultipleImages = (fieldName = "photos", maxCount = 5, options = {}) => {
    const uploadInstance = createMulterUpload({
        maxSizeMB: options.maxSizeMB || UPLOAD_LIMITS.PHOTO_MAX_SIZE_MB,
        allowedMimes: options.allowedMimes || UPLOAD_LIMITS.ALLOWED_IMAGE_MIMES,
        maxFiles: maxCount,
    });

    return (req, res, next) => {
        uploadInstance.array(fieldName, maxCount)(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    };
};

/**
 * Middleware factory for multiple named fields upload
 */
export const uploadFields = (fields = [], options = {}) => {
    const uploadInstance = createMulterUpload({
        maxSizeMB: options.maxSizeMB || UPLOAD_LIMITS.DOCUMENT_MAX_SIZE_MB,
        allowedMimes: options.allowedMimes || UPLOAD_LIMITS.ALLOWED_DOCUMENT_MIMES,
    });

    return (req, res, next) => {
        uploadInstance.fields(fields)(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    };
};

// Default export / drop-in instance
export const upload = createMulterUpload({
    maxSizeMB: UPLOAD_LIMITS.PHOTO_MAX_SIZE_MB,
    allowedMimes: UPLOAD_LIMITS.ALLOWED_IMAGE_MIMES,
    maxFiles: 5,
});
