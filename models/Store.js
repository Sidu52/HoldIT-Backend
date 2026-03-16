import mongoose from "mongoose";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";
import { addStoreToRedis, removeStoreFromRedis } from "../services/storeServices.js";

const StoreSchema = new mongoose.Schema(
    {
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
        store_open_time: {
            type: String,
        },
        store_close_time: {
            type: String,
        },
        store_description: {
            type: String,
            maxlength: 1000,
        },
        store_contact_number: {
            type: String,
            maxlength: 15,
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
                required: true,
            },
            coordinates: {
                type: [Number],
                required: true,
            },
            address: String,
        },
        service_area_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            index: true,
        },
        is_online: {
            type: Boolean,
            default: false,
            index: true,
        },
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
        last_active_at: {
            type: Date,
            index: true,
        },
        store_deactivated_reason: {
            type: String,
            maxlength: 500,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        store_owner_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StoreOwner",
            required: true,
            index: true,
        },
        verified_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    { timestamps: true }
);

StoreSchema.post("save", async function () {
    try {
        if (this.is_active && this.is_online) {
            await addStoreToRedis(this);
        } else {
            await removeStoreFromRedis(this._id, this.service_area_id);
        }
    } catch (err) {
        console.error(`[Store Hook] Redis sync failed for ${this._id}:`, err.message);
    }
});

StoreSchema.post("findOneAndUpdate", async function (doc) {
    if (!doc) return;
    try {
        if (doc.is_active && doc.is_online) {
            await addStoreToRedis(doc);
        } else {
            await removeStoreFromRedis(doc._id, doc.service_area_id);
        }
    } catch (err) {
        console.error(`[Store Hook] Redis sync failed for ${doc._id}:`, err.message);
    }
});

StoreSchema.index({ location: "2dsphere" });
StoreSchema.index({ service_area_id: 1, is_active: 1, is_online: 1 });
StoreSchema.index({ store_owner_id: 1, status: 1 });

const Store = mongoose.model("Store", StoreSchema);
export default Store;