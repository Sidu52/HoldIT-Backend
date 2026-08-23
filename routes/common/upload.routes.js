import { Router } from "express";
import {
    uploadSingleImageController,
    uploadMultipleImagesController,
    deleteImageController,
} from "../../controllers/common/upload.controller.js";
import { uploadSingleImage, uploadMultipleImages } from "../../middlewares/upload.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = Router();

// Upload single image (Max 5MB)
router.post(
    "/image",
    authMiddleware,
    uploadSingleImage("photo", { maxSizeMB: 5 }),
    uploadSingleImageController
);

// Upload multiple images (Max 5 files, 5MB each)
router.post(
    "/images",
    authMiddleware,
    uploadMultipleImages("photos", 5, { maxSizeMB: 5 }),
    uploadMultipleImagesController
);

// Delete image by public_id
router.delete(
    "/image",
    authMiddleware,
    deleteImageController
);

export default router;
