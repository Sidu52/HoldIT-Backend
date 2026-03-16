import mongoose from "mongoose";
import {
    ACCOUNT_STATUS,
    VEHICLE_TYPES,
    VERIFICATION_STATUS,
    GENDER_OPTIONS,
} from "../utils/constants.js";

const DocumentSchema = new mongoose.Schema(
    {
        doc_type: {
            type: String,
            required: true,
            enum: ["LICENSE", "AADHAAR", "PAN", "RC", "INSURANCE", "OTHER"],
        },
        url: {
            type: String,
            required: true,
        },
        verified: {
            type: Boolean,
            default: false,
        },
        verified_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        verified_at: Date,
    },
    { _id: true }
);

const DriverSchema = new mongoose.Schema(
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
            required: true,
            unique: true,
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
        is_online: {
            type: Boolean,
            default: false,
            index: true,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        last_login_at: Date,
        last_active_at: {
            type: Date,
            index: true,
        },
        account_deactivated_reason: {
            type: String,
            maxlength: 500,
            default: null,
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
        vehicle_type: {
            type: String,
            enum: Object.values(VEHICLE_TYPES),
            default: VEHICLE_TYPES.SCOOTER,
            index: true,
        },
        license_number: {
            type: String,
            sparse: true,
            unique: true,
        },
        status: {
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
        documents: [DocumentSchema],

        currentLocation: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
            },
            address: String,
            updatedAt: {
                type: Date,
            },
        },
    },
    { timestamps: true }
);

DriverSchema.post("save", async function () {
    try {
        const { addDriverToRedis, removeDriverFromRedis } = await import(
            "../services/driverGeoService.js"
        );

        if (this.is_active && this.is_online && !this.is_on_trip) {
            await addDriverToRedis(this);
        } else {
            await removeDriverFromRedis(this._id, this.service_area_id);
        }
    } catch (err) {
        console.error(`[Driver Hook] Redis sync failed for ${this._id}:`, err.message);
    }
});

DriverSchema.post("findOneAndUpdate", async function (doc) {
    if (!doc) return;
    try {
        const { addDriverToRedis, removeDriverFromRedis } = await import(
            "../services/driverGeoService.js"
        );

        if (doc.is_active && doc.is_online && !doc.is_on_trip) {
            await addDriverToRedis(doc);
        } else {
            await removeDriverFromRedis(doc._id, doc.service_area_id);
        }
    } catch (err) {
        console.error(`[Driver Hook] Redis sync failed for ${doc._id}:`, err.message);
    }
});

DriverSchema.index(
    { currentLocation: "2dsphere" },
    {
        partialFilterExpression: {
            "currentLocation.coordinates": { $exists: true },
        },
    }
);

DriverSchema.index({ is_online: 1, is_active: 1, service_area_id: 1 });
DriverSchema.index({ status: 1, verification_status: 1 });

const Driver = mongoose.model("Driver", DriverSchema);
export default Driver;