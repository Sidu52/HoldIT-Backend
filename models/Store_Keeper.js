import mongoose from "mongoose";

const StoreKeeper = new mongoose.Schema(
    {
        auth_user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auth",
            unique: true,
        },
        name: { type: String },
        store_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "stores"
        },
        onboarding_status: {
            type: String,
            enum: ["DEMO", "DOCUMENTS_PENDING", "ACTIVE"],
            default: "DEMO"
        },
    },
    { timestamps: true }
);

const StoreOwner = mongoose.model("StoreKeeper", StoreKeeper);
export default StoreOwner;
