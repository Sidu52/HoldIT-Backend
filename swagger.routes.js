import swaggerUi from "swagger-ui-express";
import { adminSwaggerSpec, userSwaggerSpec, allSwaggerSpec, driverSwaggerSpec, storeSwaggerSpec } from "./swagger.config.js";

export const setupSwagger = (app) => {
    app.use("/api-docs/admin", swaggerUi.serveFiles(adminSwaggerSpec), swaggerUi.setup(adminSwaggerSpec));
    app.use("/api-docs/user", swaggerUi.serveFiles(userSwaggerSpec), swaggerUi.setup(userSwaggerSpec));
    app.use("/api-docs/driver", swaggerUi.serveFiles(driverSwaggerSpec), swaggerUi.setup(driverSwaggerSpec));
    app.use("/api-docs/store", swaggerUi.serveFiles(storeSwaggerSpec), swaggerUi.setup(storeSwaggerSpec));
    app.use("/api-docs", swaggerUi.serveFiles(allSwaggerSpec), swaggerUi.setup(allSwaggerSpec));
};