import mongoose from "mongoose";
import { ACCOUNT_STATUS, USER_ROLES } from "../utils/constants.js";

const AuthUserSchema = new mongoose.Schema(
    {
        phone: { type: String, unique: true, index: true, sparse: true },
        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            index: true
        },
        last_login_at: Date,
        last_active_at: { type: Date, index: true },

        isVerified: { type: Boolean, default: false, index: true },

        update_by: { type: mongoose.Schema.Types.ObjectId, ref: "admin" },
    },
    { timestamps: true }
);

AuthUserSchema.index({ createdAt: 1 });

const AuthUser = mongoose.model("Auth", AuthUserSchema);
export default AuthUser;
