
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import logger from "../utils/logger.js";

const MONGO_OPTIONS = {
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 25,
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    family: 4,
    ...(process.env.MONGO_READ_PREFERENCE && {
        readPreference: process.env.MONGO_READ_PREFERENCE,
    }),
};

let isConnected = false;

export const connectMongo = async (retries = 5) => {
    if (isConnected) return;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        logger.error("[MongoDB] MONGODB_URI is not defined in .env");
        process.exit(1);
    }

    while (retries) {
        try {
            await mongoose.connect(uri, MONGO_OPTIONS);
            isConnected = true;
            logger.info("[MongoDB] Connected");
            registerMongoEvents();
            break;
        } catch (err) {
            retries -= 1;
            logger.error(`[MongoDB] Connection failed. Retries left: ${retries}. Err: ${err.message}`);
            if (retries === 0) process.exit(1);
            await new Promise(res => setTimeout(res, 5000));
        }
    }
};

const registerMongoEvents = () => {
    const conn = mongoose.connection;

    conn.on("error", (err) => {
        logger.error(`[MongoDB] Connection error: ${err.message}`);
    });

    conn.on("disconnected", () => {
        isConnected = false;
        logger.warn("[MongoDB] Disconnected — Mongoose will auto-reconnect");
    });

    conn.on("reconnected", () => {
        isConnected = true;
        logger.info("[MongoDB] Reconnected");
    });

    conn.on("close", () => {
        isConnected = false;
        logger.warn("[MongoDB] Connection closed");
    });
};

//Gracefully disconnect.
export const disconnectMongo = async () => {
    if (!isConnected) return;
    try {
        await mongoose.disconnect();
        isConnected = false;
        logger.info("[MongoDB] Disconnected gracefully");
    } catch (err) {
        logger.error(`[MongoDB] Disconnect error: ${err.message}`);
    }
};

export const isMongoConnected = () => isConnected;