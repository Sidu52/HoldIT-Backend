
import express from "express";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";
import { createServiceableArea, getServiceableAreas, getServiceableAreaById, updateServiceableArea, toggleServiceableAreaStatus, deleteServiceableArea } from "../../controllers/admin/serviceable.admin.controller.js";

const router = express.Router();

router.post("/", authMiddleware, roleMiddleware(USER_ROLES.ADMIN), createServiceableArea);
router.get("/", authMiddleware, roleMiddleware(USER_ROLES.ADMIN), getServiceableAreas);
router.get("/:id", authMiddleware, roleMiddleware(USER_ROLES.ADMIN), getServiceableAreaById);
router.put("/:id", authMiddleware, roleMiddleware(USER_ROLES.ADMIN), updateServiceableArea);
router.patch("/:id/status", authMiddleware, roleMiddleware(USER_ROLES.ADMIN), toggleServiceableAreaStatus);
router.delete("/:id", authMiddleware, roleMiddleware(USER_ROLES.SUPER_ADMIN), deleteServiceableArea);

