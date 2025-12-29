import mongoose from "mongoose";
import { GENDER_OPTIONS } from "../utils/constants.js";

const UserSchema = new mongoose.Schema(
  {
    auth_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      unique: true,
    },
    name: { type: String },
    email: { type: String, unique: true, index: true, sparse: true },
    gender: { type: String, enum: GENDER_OPTIONS },
    dob: { type: Date },
    address: { type: String },
    isSignUp: {
      type: Boolean,
      default: false,
    },
    last_login_at: Date,
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
export default User;
