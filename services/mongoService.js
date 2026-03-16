// import dotenv from "dotenv";
// dotenv.config();
// import mongoose from "mongoose";

// export const connectMongo = async () => {
//     try {
//         const url = process.env.MONGODB_URI;

//         if (!url) {
//             throw new Error("MONGODB_URI is not defined in .env");
//         }
//         await mongoose.connect(url, {
//             serverSelectionTimeoutMS: 5000,   // Fail fast if can't connect
//             heartbeatFrequencyMS: 10000,      // Check connection health
//             maxPoolSize: 10,                   // Connection pool limit
//             minPoolSize: 2,                    // Keep minimum connections alive
//         });

//         console.log("Connected to MongoDB");
//         mongoose.connection.on("error", (err) => {
//             console.error("MongoDB connection error:", err.message);
//         });

//         mongoose.connection.on("disconnected", () => {
//             console.warn("MongoDB disconnected");
//         });

//         mongoose.connection.on("reconnected", () => {
//             console.log("MongoDB reconnected");
//         });
//     } catch (error) {
//         console.error("MongoDB connection error:", error.message);
//         process.exit(1);
//     }
// };

// // Added graceful disconnect function
// export const disconnectMongo = async () => {
//     try {
//         await mongoose.disconnect();
//         console.log("MongoDB disconnected gracefully");
//     } catch (error) {
//         console.error("MongoDB disconnect error:", error.message);
//     }
// };

// services/mongoService.js

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_OPTIONS = {
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS:     10000,
    maxPoolSize:              10,
    minPoolSize:              2,
    socketTimeoutMS:          45000,
    connectTimeoutMS:         10000,
    family:                   4,      // force IPv4, avoids slow DNS on some hosts
};

let isConnected = false;

export const connectMongo = async () => {
    if (isConnected) return;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("❌ [MongoDB] MONGODB_URI is not defined in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(uri, MONGO_OPTIONS);
        isConnected = true;
        console.log("✅ [MongoDB] Connected");
        registerMongoEvents();
    } catch (err) {
        console.error("❌ [MongoDB] Initial connection failed:", err.message);
        process.exit(1);
    }
};

const registerMongoEvents = () => {
    const conn = mongoose.connection;

    conn.on("error", (err) => {
        console.error("❌ [MongoDB] Connection error:", err.message);
    });

    conn.on("disconnected", () => {
        isConnected = false;
        console.warn("⚠️  [MongoDB] Disconnected — Mongoose will auto-reconnect");
    });

    conn.on("reconnected", () => {
        isConnected = true;
        console.log("✅ [MongoDB] Reconnected");
    });

    conn.on("close", () => {
        isConnected = false;
        console.warn("⚠️  [MongoDB] Connection closed");
    });
};

/**
 * Gracefully disconnect — call during SIGTERM/SIGINT.
 */
export const disconnectMongo = async () => {
    if (!isConnected) return;
    try {
        await mongoose.disconnect();
        isConnected = false;
        console.log("✅ [MongoDB] Disconnected gracefully");
    } catch (err) {
        console.error("❌ [MongoDB] Disconnect error:", err.message);
    }
};

export const isMongoConnected = () => isConnected;