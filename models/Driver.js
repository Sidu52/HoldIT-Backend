import mongoose from "mongoose";

const DriverSchema = new mongoose.Schema(
  {
    auth_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      unique: true
    },
    name: String,
    gender: String,
    dob: Date,
    address: String,
    isSignUp: {
      type: Boolean,
      default: false,
    },
    last_login_at: {
      type: Date,
      default: null
    },
    email: { type: String, unique: true, required: true, index: true, sparse: true },
    vehicleType: String,
    licenseNumber: String,
    is_Online: { type: Boolean, default: false },
    documents: [
      {
        type: String,
        url: String,
        verified: Boolean
      }
    ],
    verification_status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING"
    },
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
