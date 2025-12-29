import express from 'express';
import dotenv from 'dotenv';
import { connectMongo } from './services/mongoService.js';
import { initSocket } from './services/socketService.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
// Route
import main from "./routes/index.js";
import auth from "./routes/auth.routes.js";
import User from "./routes/user.route.js";
import Admin from "./routes/admin.route.js";
import Driver from "./routes/driver.route.js";
import Store from "./routes/store.route.js";
import Booking from "./routes/booking.route.js";

import { initializeWorkers } from './workers/initializeWorkers.js';

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
// const corsOptions = {
//   origin: process.env.CLIENT_URL || 'http://localhost:3000',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
//   exposedHeaders: ['set-cookie'],
//   maxAge: 86400, // 24 hours
// };
app.use(cors(
  {
    origin: process.env.CLIENT_URL,
    credentials: true,
  }
));

app.use(express.json());

// MongoDB Connection
connectMongo();

initializeWorkers();

// Routes
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'admin-auth-service',
  });
});
app.use('/api/v1', main);
app.use('/api/v1/auth', auth);
app.use('/api/v1/user', User);
app.use('/api/v1/admin', Admin);
app.use('/api/v1/driver', Driver);
app.use('/api/v1/store', Store);
app.use('/api/v1/booking', Booking);

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


// const findMidValue = () => {
//   const array = [2, 3, 1, -4, 9];
//   const sumOfArray = array.reduce((a, b) => a + b);
//   console.log("sumOfArray", sumOfArray)
//   let left = 0;
//   let right = sumOfArray;

//   for (let i = 0; i < array.length; i++) {
//     right =right- array[i];
//     console.log("SUM", i, left, right)
//     if (left == right) {
//       return i;
//     }
//     left =left+ array[i];
//   }
//   return -1
// }

// Recursion
// const findMidValue = (array, i = 0, left, right) => {
//   right=right-array[i]
//   if(left==right){
//     return i;
//   }
//   if(i==array.length-1){
//     return -1;
//   }

//  return findMidValue(array, i+1, left+array[i],right );
// }

// const array = [2,-1,1];
// console.log("findMidValueIndex", findMidValue(array,0,0,array.reduce((a, b) => a + b)))
