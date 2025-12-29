import mongoose from "mongoose";

const AuthUserSchema = new mongoose.Schema(
    {
        phone: { type: String, unique: true, index: true, sparse: true },
        role: {
            type: String,
            enum: ["USER", "DRIVER", "STORE_KEEPER"],
        },
        last_login_at: Date,
        isVerified: { type: Boolean, default: false },
        update_by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        status: {
            type: String,
            enum: ["ACTIVE", "BLOCKED", "DELETED", "PENDING"],
        }
    },
    { timestamps: true }
);

const AuthUser = mongoose.model("Auth", AuthUserSchema);
export default AuthUser;
