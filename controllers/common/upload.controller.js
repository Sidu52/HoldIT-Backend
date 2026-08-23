import asyncHandler from "express-async-handler";
import { uploadBufferToCloudinary, uploadMultipleBuffers, deleteFromCloudinary } from "../../services/cloudinaryService.js";
import { CLOUDINARY_FOLDERS } from "../../constants/cloudinary.folders.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";

/**
 * Upload single image to Cloudinary
 * POST /api/v1/upload/image
 */
export const uploadSingleImageController = asyncHandler(async (req, res) => {
    if (!req.file) {
        return sendError(res, "No image file provided", STATUS_CODES.BAD_REQUEST);
    }

    const folderType = req.body?.folderType || "general";
    let targetFolder = CLOUDINARY_FOLDERS.GENERAL;

    switch (folderType.toLowerCase()) {
        case "user_avatar":
        case "user":
            targetFolder = CLOUDINARY_FOLDERS.USERS.AVATARS;
            break;
        case "driver_avatar":
            targetFolder = CLOUDINARY_FOLDERS.DRIVERS.AVATARS;
            break;
        case "driver_document":
            targetFolder = CLOUDINARY_FOLDERS.DRIVERS.DOCUMENTS;
            break;
        case "driver_vehicle":
            targetFolder = CLOUDINARY_FOLDERS.DRIVERS.VEHICLES;
            break;
        case "store":
        case "storefront":
            targetFolder = CLOUDINARY_FOLDERS.STORES.STOREFRONTS;
            break;
        case "storage_area":
            targetFolder = CLOUDINARY_FOLDERS.STORES.STORAGE_AREAS;
            break;
        case "pickup":
            targetFolder = CLOUDINARY_FOLDERS.BOOKINGS.PICKUP;
            break;
        case "storage":
            targetFolder = CLOUDINARY_FOLDERS.BOOKINGS.STORAGE;
            break;
        case "delivery":
            targetFolder = CLOUDINARY_FOLDERS.BOOKINGS.DELIVERY;
            break;
        case "support":
            targetFolder = CLOUDINARY_FOLDERS.SUPPORT.ATTACHMENTS;
            break;
        case "review":
            targetFolder = CLOUDINARY_FOLDERS.REVIEWS.PHOTOS;
            break;
        default:
            targetFolder = CLOUDINARY_FOLDERS.GENERAL;
            break;
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: targetFolder,
    });

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Image uploaded successfully",
        data: {
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
        },
    });
});

/**
 * Upload multiple images to Cloudinary
 * POST /api/v1/upload/images
 */
export const uploadMultipleImagesController = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return sendError(res, "No image files provided", STATUS_CODES.BAD_REQUEST);
    }

    const folderType = req.body?.folderType || "general";
    let targetFolder = CLOUDINARY_FOLDERS.GENERAL;

    if (folderType === "pickup") targetFolder = CLOUDINARY_FOLDERS.BOOKINGS.PICKUP;
    else if (folderType === "storage") targetFolder = CLOUDINARY_FOLDERS.BOOKINGS.STORAGE;
    else if (folderType === "delivery") targetFolder = CLOUDINARY_FOLDERS.BOOKINGS.DELIVERY;
    else if (folderType === "support") targetFolder = CLOUDINARY_FOLDERS.SUPPORT.ATTACHMENTS;
    else if (folderType === "review") targetFolder = CLOUDINARY_FOLDERS.REVIEWS.PHOTOS;

    const results = await uploadMultipleBuffers(req.files, {
        folder: targetFolder,
    });

    const uploaded = results.map((r) => ({
        url: r.secure_url,
        public_id: r.public_id,
        format: r.format,
        bytes: r.bytes,
    }));

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: `${uploaded.length} image(s) uploaded successfully`,
        data: {
            images: uploaded,
            urls: uploaded.map((u) => u.url),
        },
    });
});

/**
 * Delete image from Cloudinary
 * DELETE /api/v1/upload/image
 */
export const deleteImageController = asyncHandler(async (req, res) => {
    const { public_id } = req.body;
    if (!public_id) {
        return sendError(res, "public_id is required", STATUS_CODES.BAD_REQUEST);
    }

    const result = await deleteFromCloudinary(public_id);

    return sendResponse({
        res,
        statusCode: STATUS_CODES.SUCCESS,
        message: "Image deleted successfully",
        data: result,
    });
});
