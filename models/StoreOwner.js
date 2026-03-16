import mongoose from "mongoose";
import { ACCOUNT_STATUS, GENDER_OPTIONS, ON_BOARDING_STATUS } from "../utils/constants.js";

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
        date_of_birth: {
            type: Date,
        },
        address: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        last_login_at: {
            type: Date,
        },
        last_active_at: {
            type: Date,
            index: true,
        },
        is_verified: {
            type: Boolean,
            default: false,
            index: true,
        },
        updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        onboarding_status: {
            type: String,
            enum: Object.values(ON_BOARDING_STATUS),
            default: ON_BOARDING_STATUS.DEMO,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        account_deactivated_reason: {
            type: String,
            maxlength: 500,
            default: null,
        },
    },
    { timestamps: true }
);

// Compound indexes
StoreOwnerSchema.index({ status: 1, onboarding_status: 1 });

// BUG FIX 7: Virtual to get all stores belonging to this owner
StoreOwnerSchema.virtual('stores', {
    ref: 'Store',
    localField: '_id',
    foreignField: 'store_owner_id',
});

StoreOwnerSchema.set('toJSON', { virtuals: true });
StoreOwnerSchema.set('toObject', { virtuals: true });

const StoreOwner = mongoose.model("StoreOwner", StoreOwnerSchema);
export default StoreOwner;