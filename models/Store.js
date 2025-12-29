import mongoose from "mongoose";

const StoreSchema = new mongoose.Schema(
  {
    store_name: String,
    store_address: String,
    store_capacity: Number,
    store_close_time: String,
    store_open_time: String,
    store_description: String,
    bookingId:[{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true
    }],
    location: {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point"
    },
    coordinates: {
      type: [Number],
      required: true
    },
    address: String
  },
  isActive: {
      type: Boolean,
      default: true
    },
    is_online: {
      type: Boolean,
      default: true
    },
    bookingAssigned: {
      type: Number,
      default: 0
    },
     rating: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE"
    },
    store_owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreKeeper",
      required: true
    },
     lastAssignedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// 2dsphere index on the `location` field to calculate radius distance
StoreSchema.index({ location: "2dsphere" });

const Store = mongoose.model("Store", StoreSchema);
export default Store;
