import mongoose from "mongoose";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";

const DriverSchema = new mongoose.Schema(
  {
    auth_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      unique: true,
      index: true
    },

    name: String,
    gender: String,
    dob: Date,
    address: String,

    email: {
      type: String,
      unique: true,
      index: true,
      sparse: true
    },

    vehicleType: String,
    licenseNumber: String,

    is_online: {
      type: Boolean,
      default: false,
      index: true
    },

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

    last_login_at: Date,
    last_active_at: {
      type: Date,
      index: true
    },

    service_area_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceArea",
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
