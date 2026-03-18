import mongoose, { Mongoose } from "mongoose";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../utils/constants.js";

// SubSchema for Address
const AddressSchema = new mongoose.Schema({
     _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
    },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postal_code: { type: String, required: true },
    country: { type: String, required: true },
    coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
            validator: function (v) {
                return v.length === 2 && !isNaN(v[0]) && !isNaN(v[1]);
            },
            message: 'Coordinates must be an array with [longitude, latitude].'
        },
    },
    is_serviceable: { type: Boolean, default: false },
    is_default: { type: Boolean, default: false }, // Mark the default address
}, { _id: false });

const UserSchema = new mongoose.Schema(
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
            maxlength: 15,
        },
        gender: {
            type: String,
            enum: Object.values(GENDER_OPTIONS),
        },
        dob: {
            type: Date,
        },
        addresses: {
            type: [AddressSchema],
            validate: {
                validator: function (addresses) {
                    return addresses.length <= 10;
                },
                message: 'You can only have up to 10 addresses',
            },
        },
        is_verified: {
            type: Boolean,
            default: false,
            index: true,
        },
        is_signup: {
            type: Boolean,
            default: false,
        },
        last_login_at: {
            type: Date,
        },
        last_active_at: {
            type: Date,
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
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
            },
            address: String,
        },
        service_area_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            index: true,
        },
        is_serviceable: {
            type: Boolean,
            default: false,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true,
        },
    },
    { timestamps: true }
);

UserSchema.index(
    { location: "2dsphere" },
    {
        partialFilterExpression: {
            "location.coordinates": { $exists: true },
        },
    }
);

UserSchema.index({ phone: 1, status: 1 });
UserSchema.index({ is_active: 1, is_serviceable: 1 });

const User = mongoose.model("User", UserSchema);
export default User;