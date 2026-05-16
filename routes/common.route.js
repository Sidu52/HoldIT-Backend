import express from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getMe } from "../controllers/common/common.controller.js";

const router = express.Router();

router.get("/api/v1/me", authMiddleware, getMe);

const CommonRoutes = (app) => {
    app.use(router);
};

export default CommonRoutes;