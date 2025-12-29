import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pickup_driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    delivery_driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    bags_count: { type: Number, default: 1 },
    user_pickup_location: {
      lat: Number,
      lng: Number,
      address: String
    },
    // Time when store handover is scheduled to calculate store pricing
    store_handoverAt: {
      type: Date,
      default: null
    },

    pickup_from_storeAt: {
      type: Date,
      default: null
    },

    user_delivery_location: {
      lat: Number,
      lng: Number,
      address: String
    },
    assinment_type: {
      type: String,
      enum: ["PICKUP", "DELIVERY","RETURN"],
      default: "PICKUP"
    },
    status: {
      type: String,
      enum: [
        "CREATED",
        "DRIVER_ASSIGNED",
        "DRIVER_ARRIVED",
        "PICKED_UP",
        "STORED",
        "RETURN_REQUESTED",
        "DRIVER_ASSIGNED",
        "OUT_FOR_RETURN",
        "DELIVERED",
        "CANCELLED"
      ],
      default: "CREATED"
    },
    driverAcceptedAt: Date,
    pricing: {
      per_hour_rate: Number,
      total_hours: Number,
      distance_charge: Number,
      total_amount: Number
    },
    pickupTime: Date,
    delivery_time: Date,
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", BookingSchema);
export default Booking;