// models/Store.js

import mongoose from "mongoose";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";

const StoreSchema = new mongoose.Schema(
    {
        // ── Auth ──────────────────────────────────────────────────────
        // Phone is the login identifier for OTP auth, same pattern as Driver/User.
        // store_contact_number is kept separately as the public-facing contact.
        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        last_login_at: Date,
        last_active_at: Date,

        // ── Store Info ────────────────────────────────────────────────
        store_name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        store_address: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        store_open_time: String,
        store_close_time: String,
        store_description: {
            type: String,
            maxlength: 1000,
        },
        store_contact_number: {
            type: String,
            maxlength: 15,
        },

        // ── Location ──────────────────────────────────────────────────
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
                required: true,
            },
            coordinates: {
                type: [Number],   // [lng, lat] — GeoJSON order
                required: true,
            },
            address: String,
        },

        // ── Service area ──────────────────────────────────────────────
        service_area_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            index: true,
        },

        // ── Online / Active state ─────────────────────────────────────
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

        // ── Verification & Status ─────────────────────────────────────
        verification_status: {
            type: String,
            enum: Object.values(VERIFICATION_STATUS),
            default: VERIFICATION_STATUS.PENDING,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true,
        },
        verified_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },

        // ── Capacity & Rating ─────────────────────────────────────────
        booking_assigned_count: {
            type: Number,
            default: 0,
            min: 0,
        },
        max_booking_capacity: {
            type: Number,
            default: 50,
        },
        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        rating_count: {
            type: Number,
            default: 0,
            min: 0,
        },

        // ── Ownership ─────────────────────────────────────────────────
        store_owner_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StoreOwner",
            index: true,
        },

        store_deactivated_reason: {
            type: String,
            maxlength: 500,
        },
    },
    { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
StoreSchema.index({ location: "2dsphere" });
StoreSchema.index({ service_area_id: 1, is_active: 1, is_online: 1 });
StoreSchema.index({ status: 1, verification_status: 1 });

// ── Redis sync hooks ──────────────────────────────────────────────────────────
const syncStoreToRedis = async (doc) => {
    if (!doc) return;
    try {
        const { addStoreToRedis, removeStoreFromRedis } = await import(
            "../services/storeServices.js"
        );

        const shouldBeInRedis =
            doc.is_active &&
            doc.is_online &&
            doc.status === ACCOUNT_STATUS.ACTIVE &&
            doc.verification_status === VERIFICATION_STATUS.VERIFIED;

        if (shouldBeInRedis) {
            await addStoreToRedis(doc);
        } else {
            await removeStoreFromRedis(doc._id, doc.service_area_id);
        }
    } catch (err) {
        console.error(`[Store Hook] Redis sync failed for ${doc._id}:`, err.message);
    }
};

StoreSchema.post("save", function () { return syncStoreToRedis(this); });
StoreSchema.post("findOneAndUpdate", function (doc) { return syncStoreToRedis(doc); });

const Store = mongoose.model("Store", StoreSchema);
export default Store;