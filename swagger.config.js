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
    apis: [
        path.join(__dirname, "./docs/swagger/swagger.tags.js"),
        path.join(__dirname, "./docs/swagger/admin/*.js"),
    ],
});

// User Swagger
export const userSwaggerSpec = swaggerJSDoc({
    definition: {
        ...baseDefinition,
        info: { ...baseDefinition.info, title: "Holdit User API" },
    },
    apis: [
        path.join(__dirname, "./docs/swagger/swagger.tags.js"),
        path.join(__dirname, "./docs/swagger/user/*.js"),
    ],
});

// Driver Swagger
export const driverSwaggerSpec = swaggerJSDoc({
    definition: {
        ...baseDefinition,
        info: { ...baseDefinition.info, title: "Holdit Driver API" },
    },
    apis: [
        path.join(__dirname, "./docs/swagger/swagger.tags.js"),
        path.join(__dirname, "./docs/swagger/driver/*.js"),
    ],
});

// Store Swagger
export const storeSwaggerSpec = swaggerJSDoc({
    definition: {
        ...baseDefinition,
        info: { ...baseDefinition.info, title: "Holdit Store API" },
    },
    apis: [
        path.join(__dirname, "./docs/swagger/swagger.tags.js"),
        path.join(__dirname, "./docs/swagger/store/*.js"),
    ],
});

// Store Owner Swagger
export const storeOwnerSwaggerSpec = swaggerJSDoc({
    definition: {
        ...baseDefinition,
        info: { ...baseDefinition.info, title: "Holdit Store Owner API" },
    },
    apis: [
        path.join(__dirname, "./docs/swagger/swagger.tags.js"),
        path.join(__dirname, "./docs/swagger/storeOwner/*.js"),
    ],
});

// All Swagger
export const allSwaggerSpec = swaggerJSDoc({
    definition: {
        ...baseDefinition,
        info: { ...baseDefinition.info, title: "Holdit API - Full" },
    },
    apis: [
        path.join(__dirname, "./docs/swagger/swagger.tags.js"),
        path.join(__dirname, "./docs/swagger/bulk.upload.swagger.js"),
        path.join(__dirname, "./docs/swagger/*.js"),
        path.join(__dirname, "./docs/swagger/admin/*.js"),
        path.join(__dirname, "./docs/swagger/user/*.js"),
        path.join(__dirname, "./docs/swagger/driver/*.js"),
        path.join(__dirname, "./docs/swagger/store/*.js"),
        path.join(__dirname, "./docs/swagger/storeOwner/*.js"),
    ],
});