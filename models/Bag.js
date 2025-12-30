import mongoose from "mongoose";

const BagSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true
    },

    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      index: true
    },

    pickup_driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      index: true
    },

    delivery_driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      index: true
    },

    qrCode: {
      type: String,
      unique: true,
      index: true
    },

    size: {
      type: String,
      enum: ["SMALL", "MEDIUM", "LARGE"],
      required: true
    },

    status: {
      type: String,
      enum: [
        "CREATED",
        "PICKED_UP",
        "IN_TRANSIT",
        "STORED",
        "OUT_FOR_RETURN",
        "DELIVERED",
        "LOST",
        "DAMAGED"
      ],
      default: "CREATED",
      index: true
    },

    sealStatus: {
      type: Boolean,
      default: true
    },

    stored_at: Date,
    picked_up_at: Date,
    delivered_at: Date,

    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);


const Bag = mongoose.model("Bag", BagSchema);
export default Bag;