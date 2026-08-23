import express from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getMe } from "../controllers/common/common.controller.js";
import { getHealthStatus } from "../controllers/common/health.controller.js";
import uploadRoutes from "./common/upload.routes.js";

const router = express.Router();

// Public health check probes for cloud load balancers & monitoring
router.get("/health", getHealthStatus);
router.get("/api/v1/health", getHealthStatus);

router.get("/api/v1/me", authMiddleware, getMe);

const CommonRoutes = (app) => {
    app.use(router);
    app.use("/api/v1/upload", uploadRoutes);
};

export default CommonRoutes;