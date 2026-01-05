import mongoose from "mongoose";
import { ACCOUNT_STATUS, VEHICLE_TYPES, VERIFICATION_STATUS, GENDER_OPTIONS } from "../utils/constants.js";

const DriverSchema = new mongoose.Schema(
  {
    auth_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      unique: true,
      index: true
    },
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
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    gender: { type: String, enum: GENDER_OPTIONS },
    dob: { type: Date },
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
    isSignUp: {
      type: Boolean,
      default: false,
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
