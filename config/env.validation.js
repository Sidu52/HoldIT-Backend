import { z } from "zod";
import logger from "../utils/logger.js";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3000"),
  MONGODB_URI: z.string().url("MONGODB_URI must be a valid URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().transform(Number).optional(),
  ACCESS_TOKEN_SECRET: z.string().min(10, "ACCESS_TOKEN_SECRET must be at least 10 chars"),
  REFRESH_TOKEN_SECRET: z.string().min(10, "REFRESH_TOKEN_SECRET must be at least 10 chars"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

export const validateEnv = () => {
    try {
        const envVars = envSchema.parse(process.env);
        // Expose validated vars safely
        process.env.PORT = envVars.PORT.toString();
        // and others...
        logger.info("[EnvLoader] Environment variables validated successfully.");
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.error("[EnvLoader] Environment validation failed:");
            const issues = err.issues || err.errors || [];
            issues.forEach((e) => {
                logger.error(`  - ${e.path.join(".")}: ${e.message}`);
            });
        } else {
            logger.error(`[EnvLoader] Validation failed: ${err.message}`);
        }
        process.exit(1);
    }
};
