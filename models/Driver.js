import mongoose from "mongoose";
import logger from "../utils/logger.js";
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
        is_on_trip: {
            type: Boolean,
            default: false,
            index: true,
        },
        current_booking_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
        },
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
        service_area_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            index: true,
        },
        push_token: {
            type: String,
            trim: true,
            default: null,
            index: true,
        },
        is_serviceable: {
            type: Boolean,
            default: false,
            index: true,
        },
        is_signup: {
            type: Boolean,
            default: false,
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

        currentLocation: {
            type: {
                type: String,
                enum: ["Point"]
            },
            coordinates: {
                type: [Number],
            },
            address: String,
            updatedAt: Date,
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
        updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        documents: [DocumentSchema],
        rating_avg: {
            type: Number,
            default: 0,
            index: true,
        },
        rating_count: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: "drivers"
    }
);

DriverSchema.index(
    { currentLocation: "2dsphere" },
    {
        partialFilterExpression: {
            "currentLocation.coordinates": { $exists: true }
        }
    }
);
DriverSchema.index({ is_online: 1, service_area_id: 1 });
DriverSchema.index({ account_status: 1, verification_status: 1 });
DriverSchema.index({ is_on_trip: 1, is_online: 1 });

const syncDriverToRedis = async (doc) => {
    if (!doc) return;
    try {
        const { addDriverToRedis, removeDriverFromRedis } = await import(
            "../services/driverGeoService.js"
        );

        const shouldBeInRedis =
            doc.account_status === ACCOUNT_STATUS.ACTIVE &&
            doc.is_online &&
            !doc.is_on_trip &&
            doc.verification_status === VERIFICATION_STATUS.VERIFIED;

        if (shouldBeInRedis) {
            await addDriverToRedis(doc);
        } else {
            await removeDriverFromRedis(doc._id, doc.service_area_id);
        }
    } catch (err) {
        logger.error(`[Driver Hook] Redis sync failed for ${doc._id}:`, err.message);
    }
};

DriverSchema.post("save", function () {
    return syncDriverToRedis(this);
});

DriverSchema.post("findOneAndUpdate", function (doc) {
    return syncDriverToRedis(doc);
});

const Driver = mongoose.model("Driver", DriverSchema);
export default Driver;