// models/Counter.js
import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true }, // e.g. "invoice-2026-27"
        seq: { type: Number, default: 0 },
    },
    { versionKey: false }
);

const Counter = mongoose.model("Counter", CounterSchema);
export default Counter;