import express from "express";
import { bulkUploadAdmin, bulkUploadBooking, bulkUploadDriver, bulkUploadStore, bulkUploadUsers, bulkUploadServiceableAreas } from "../../controllers/bulk_upload/bulk_upload.js";
const router = express.Router();

// Bulk Upload Routes

router.post("/admin/bulk_upload", bulkUploadAdmin);
router.post("/user/bulk_upload", bulkUploadUsers);
router.post("/driver/bulk_upload", bulkUploadDriver);
router.post("/store/bulk_upload", bulkUploadStore);
router.post("/booking/bulk_upload", bulkUploadBooking);
router.post("/serviceable_area/bulk_upload", bulkUploadServiceableAreas);

export default router;
