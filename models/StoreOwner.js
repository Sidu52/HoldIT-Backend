import mongoose from "mongoose";
import { ACCOUNT_STATUS, ON_BOARDING_STATUS } from "../utils/constants.js";

const StoreOwnerSchema = new mongoose.Schema(
    {
        auth_user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auth",
            unique: true,
            index: true
        },

        name: String,

        store_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            index: true
        },

        onboarding_status: {
            type: String,
            enum: Object.values(ON_BOARDING_STATUS),
            default: ON_BOARDING_STATUS.DEMO,
            index: true
        },

        status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true
        }
    },
    { timestamps: true }
);
const StoreOwner = mongoose.model("StoreOwner", StoreOwnerSchema);
export default StoreOwner;
