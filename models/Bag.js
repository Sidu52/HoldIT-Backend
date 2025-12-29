import mongoose from "mongoose";

const BagSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking"
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store"
    },
    qrCode: String,
    size: { type: String, enum: ["SMALL", "MEDIUM", "LARGE"] },
    sealStatus: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Bag = mongoose.model("Bag", BagSchema);
export default Bag;

// Relations

// Booking 1 → * Bags

// Store 1 → * Bags