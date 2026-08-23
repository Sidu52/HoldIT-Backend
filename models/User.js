import mongoose from "mongoose";
import { ACCOUNT_STATUS, ADDRESS_TYPE_OPTIONS, GENDER_OPTIONS, VERIFICATION_STATUS } from "../utils/constants.js";

const AddressSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            trim: true,
            enum: ADDRESS_TYPE_OPTIONS,
        },
        street: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        postal_code: { type: String, required: true, trim: true },
        country: { type: String, required: true, trim: true },
        coordinates: {
            type: [Number],
            validate: {
                validator: (v) => v.length === 2 && !isNaN(v[0]) && !isNaN(v[1]),
                message: "Coordinates must be [longitude, latitude].",
            },
        },
        is_serviceable: { type: Boolean, default: false },
        is_default: { type: Boolean, default: false },
    }
);

const UserSchema = new mongoose.Schema(
    {
        first_name: { type: String, trim: true, maxlength: 100 },
        last_name: { type: String, trim: true, maxlength: 100 },

        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
        },

        phone: {
            type: String,
            unique: true,
            required: true,
            trim: true,
            maxlength: 15,
        },

        gender: {
            type: String,
            enum: GENDER_OPTIONS,
        },

        date_of_birth: { type: Date },

        addresses: {
            type: [AddressSchema],
            default: [],
            validate: {
                validator: (arr) => arr.length <= 10,
                message: "You can have at most 10 saved addresses.",
            },
        },
        // Primary/current location set during onboarding
        location: {
            type: {
                type: String,
                enum: ["Point"],
            },
            coordinates: { type: [Number] }, // [lng, lat]
            address: { type: String, trim: true },
        },

        is_serviceable: { type: Boolean, default: false, index: true },

        service_area_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            default: null,
        },

        account_status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true,
        },

        // Tracks whether the user has verified their phone and completed profile
        is_signup: { type: Boolean, default: false },
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
        updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },

        push_token: {
            type: String,
            trim: true,
            default: null,
            index: true,
        },

        last_login_at: { type: Date },
        last_active_at: { type: Date, index: true },
    },
    { timestamps: true }
);

UserSchema.index(
    { location: "2dsphere" },
    { partialFilterExpression: { "location.coordinates": { $exists: true, $ne: [] } } }
);

UserSchema.index({ phone: 1, account_status: 1 });

const User = mongoose.model("User", UserSchema);
export default User;