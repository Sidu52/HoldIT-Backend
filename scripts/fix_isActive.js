// One-time migration: fix isActive for all existing bookings
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const TERMINAL = ["delivered", "cancelled", "driver_cancelled_critical"];

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const col = mongoose.connection.db.collection("bookings");

    const r1 = await col.updateMany(
        { status: { $nin: TERMINAL }, isActive: { $ne: true } },
        { $set: { isActive: true } }
    );
    console.log("Fixed active bookings:", r1.modifiedCount);

    const r2 = await col.updateMany(
        { status: { $in: TERMINAL }, isActive: { $ne: false } },
        { $set: { isActive: false } }
    );
    console.log("Fixed terminal bookings:", r2.modifiedCount);

    process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
