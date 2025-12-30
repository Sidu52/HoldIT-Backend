import mongoose from "mongoose";
import { ASSIGNMENT_TYPES, BOOKING_STATUS } from "../utils/constants.js";

const BookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      index: true
    },

    service_area_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceArea",
      index: true
    },

    booking_date: {
      type: Date,
      index: true,
      default: Date.now
    },

    bags_count: { type: Number, default: 1 },

    user_pickup_location: {
      lat: Number,
      lng: Number,
      address: String
    },

    user_delivery_location: {
      lat: Number,
      lng: Number,
      address: String
    },

    assignment_type: {
      type: String,
      enum: Object.values(ASSIGNMENT_TYPES),
      default: ASSIGNMENT_TYPES.PICKUP,
      index: true
    },

    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      index: true,
      required: true,
    },

    last_status_updated_at: {
      type: Date,
      default: Date.now,
      index: true
    },

    store_handoverAt: Date,
    pickup_from_storeAt: Date,

    pickupTime: Date,
    delivery_time: Date,

    driverAcceptedAt: Date,
    cancelled_at: Date,
    completed_at: Date,

    is_active: {
      type: Boolean,
      default: true,
      index: true
    },

    pricing: {
      per_hour_rate: Number,
      total_hours: Number,
      distance_charge: Number,
      total_amount: Number
    }
  },
  { timestamps: true }
);


const Booking = mongoose.model("Booking", BookingSchema);
export default Booking;