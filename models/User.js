import mongoose from "mongoose";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../utils/constants.js";

const UserSchema = new mongoose.Schema(
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
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
      required: true,
    },
    gender: { type: String, enum: GENDER_OPTIONS },
    dob: { type: Date },
    address: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    isSignUp: {
      type: Boolean,
      default: false,
    },
    last_login_at: {
      type: Date,
    },
    last_active_at: {
      type: Date,
      index: true
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    },
    account_deactivated_reason: {
      type: String,
      maxlength: 100,
      default: null,
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
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.PENDING,
      index: true
    },

  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
export default User;
