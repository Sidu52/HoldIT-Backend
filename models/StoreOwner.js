import mongoose from "mongoose";
import { ACCOUNT_STATUS, GENDER_OPTIONS, VERIFICATION_STATUS } from "../utils/constants.js";

const StoreOwnerSchema = new mongoose.Schema(
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
        phone: {
            type: String,
            unique: true,
            required: true,
            maxlength: 15,
        },
        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
        },
        gender: {
            type: String,
            enum: Object.values(GENDER_OPTIONS),
        },
        date_of_birth: Date,
        address: {
            type: String,
            trim: true,
            maxlength: 500,
        },

        last_login_at: Date,

        account_status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true,
        },
        verification_status: {
            type: String,
            enum: Object.values(VERIFICATION_STATUS),
            default: VERIFICATION_STATUS.PENDING,
            index: true,
        },

        account_deactivated_reason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null,
        },
        deactivated_at: Date,
        deactivated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    { timestamps: true }
);

StoreOwnerSchema.index({ account_status: 1, verification_status: 1 });
StoreOwnerSchema.virtual("stores", {
    ref: "Store",
    localField: "_id",
    foreignField: "store_owner_id",
});


const StoreOwner = mongoose.model("StoreOwner", StoreOwnerSchema);
export default StoreOwner;