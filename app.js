import express from 'express';
import dotenv from 'dotenv';
import { connectMongo } from './services/mongoService.js';
import { initSocket } from './services/socketService.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
// Route
import BulkUpload from "./routes/bulk_upload/bulk_upload.js";

import AdminRoutes from "./routes/admin/index.js";
import UserRoutes from './routes/users/index.js';
import DriverRoutes from './routes/driver/index.js';

import swaggerUi from 'swagger-ui-express';
// import swaggerSpec from './swagger.js';
import { adminSwaggerSpec, userSwaggerSpec } from './swagger.js';

import { initializeWorkers } from './workers/initializeWorkers.js';
import { syncStoresToRedis } from "./services/storeSync.js";
import { syncDriversToRedis } from "./services/driverSync.js";
dotenv.config();

const app = express();
// Use cookie-parser middleware to parse cookies
app.use(cookieParser());
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
connectMongo();

initializeWorkers();


// Sync stores to Redis on startup

await syncStoresToRedis();
await syncDriversToRedis();


// Routes
// Health check endpoint
app.get("/health", (req, res) => res.json({ message: "OK" }));


AdminRoutes(app);
DriverRoutes(app);
UserRoutes(app);


// app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(
  "/admin/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(adminSwaggerSpec)
);

app.use(
  "/user/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(userSwaggerSpec)
);
app.use('/api/v1/', BulkUpload);


// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  const statusCode = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Create HTTP server and pass it to Socket.IO
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 8000}`);
});

// Initialize Socket.IO
const io = initSocket(server);