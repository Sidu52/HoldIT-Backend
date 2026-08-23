import mongoose from "mongoose";
import { USER_ROLES } from "../utils/constants.js";

export const REQUEST_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

const TeamJoinRequestSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 15,
    },
    desired_role: {
      type: String,
      lowercase: true,
      trim: true,
      enum: [USER_ROLES.ADMIN, USER_ROLES.OPERATION_MANAGER, USER_ROLES.CUSTOMER_SUPPORT],
      default: USER_ROLES.CUSTOMER_SUPPORT,
    },
    experience_notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.PENDING,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const TeamJoinRequest = mongoose.model("TeamJoinRequest", TeamJoinRequestSchema);
export default TeamJoinRequest;
