import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

export const connectMongo = async () => {
    try {
        const url = process.env.MONGODB_URI;

        if (!url) {
            throw new Error("MONGODB_URI is not defined in .env");
        }
        await mongoose.connect(url, {
            serverSelectionTimeoutMS: 5000,   // Fail fast if can't connect
            heartbeatFrequencyMS: 10000,      // Check connection health
            maxPoolSize: 10,                   // Connection pool limit
            minPoolSize: 2,                    // Keep minimum connections alive
        });

        console.log("Connected to MongoDB");
        mongoose.connection.on("error", (err) => {
            console.error("MongoDB connection error:", err.message);
        });

        mongoose.connection.on("disconnected", () => {
            console.warn("MongoDB disconnected");
        });

        mongoose.connection.on("reconnected", () => {
            console.log("MongoDB reconnected");
        });
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        process.exit(1);
    }
};

// Added graceful disconnect function
export const disconnectMongo = async () => {
    try {
        await mongoose.disconnect();
        console.log("MongoDB disconnected gracefully");
    } catch (error) {
        console.error("MongoDB disconnect error:", error.message);
    }
};