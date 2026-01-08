import mongoose from "mongoose";
import { ACCOUNT_STATUS, GENDER_OPTIONS, ON_BOARDING_STATUS } from "../utils/constants.js";

const Store_Owner = new mongoose.Schema(
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
            index: true,
            sparse: true,
            required: true,
        },
        email: {
            type: String,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
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
            maxlength: 100,
        },
        last_login_at: {
            type: Date,
        },
        last_active_at: {
            type: Date,
            index: true
        },
        is_verified: {
            type: Boolean,
            default: false,
            index: true
        },
        update_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "admin",
            index: true
        },
        store_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "stores"
        },
        onboarding_status: {
            type: String,
            enum: Object.values(ON_BOARDING_STATUS),
            default: "DEMO"
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

const StoreOwner = mongoose.model("StoreOwner", Store_Owner);
export default StoreOwner;
