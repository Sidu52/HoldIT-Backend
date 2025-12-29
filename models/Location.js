import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["PICKUP", "DROP", "STORE"]
    },
    address: String,
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: [Number] // [lng, lat]
    }
  },
  { timestamps: true }
);

LocationSchema.index({ coordinates: "2dsphere" });

const Location = mongoose.model("Location", LocationSchema);
export default Location;
