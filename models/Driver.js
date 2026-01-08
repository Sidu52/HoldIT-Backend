import mongoose from "mongoose";
import { ACCOUNT_STATUS, VEHICLE_TYPES, VERIFICATION_STATUS, GENDER_OPTIONS } from "../utils/constants.js";

const DriverSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    last_name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    phone: { type: String,
       unique: true,
        index: true,
         sparse: true,
         required: true,
        },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    gender: { type: String, enum: GENDER_OPTIONS },
    date_of_birth: { type: Date },
    address: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    is_online: {
      type: Boolean,
      default: false,
      index: true
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    },
    last_login_at: {
      type: Date,
    },
    last_active_at: {
      type: Date,
      index: true
    },
    is_verified: {
      type: Boolean,
      default: false,
      index: true
    },
    update_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      index: true
    },
    service_area_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceArea",
      index: true
    },
    is_serviceable: {
      type: Boolean,
      default: true,
      index: true
    },
    vehicle_type: {
      type: String,
      enum: Object.values(VEHICLE_TYPES),
      default: VEHICLE_TYPES.SCOOTER,
      index: true
    },
    license_number: String,
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.PENDING,
      index: true
    },

    verification_status: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
      index: true
    },
    documents: [
      {
        type: String,
        url: String,
        verified: Boolean
      }
    ],

    currentLocation: {
      lat: Number,
      lng: Number,
      address: String
    }
  },
  { timestamps: true }
);


const Driver = mongoose.model("Driver", DriverSchema);
export default Driver;
