import swaggerJSDoc from "swagger-jsdoc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Holdit API Documentation",
    version: "1.0.0",
  },
  servers: [{ url: "http://localhost:5000" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

// Admin Swagger
export const adminSwaggerSpec = swaggerJSDoc({
  definition: {
    ...baseDefinition,
    info: { ...baseDefinition.info, title: "Holdit Admin API" },
  },
  apis: [path.join(__dirname, "./docs/swagger/admin/**/*.js")],
});

// User Swagger
export const userSwaggerSpec = swaggerJSDoc({
  definition: {
    ...baseDefinition,
    info: { ...baseDefinition.info, title: "Holdit User API" },
  },
  apis: [path.join(__dirname, "./docs/swagger/user/**/*.js")],
});
