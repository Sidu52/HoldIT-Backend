import mongoose from "mongoose";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";
import logger from "../utils/logger.js";


const StoreSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        store_owner_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StoreOwner",
            index: true,
        },
        store_name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        store_description: {
            type: String,
            maxlength: 1000,
        },
        store_contact_number: {
            type: String,
            maxlength: 15,
        },
        store_open_time: {
            type: String,
            required: true,
        },
        store_close_time: {
            type: String,
            required: true,
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
            is_serviceable: {
                type: Boolean,
                default: false,
            }
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
        current_booking_count: {
            type: Number,
            default: 0,
            min: 0,
        },
        max_booking_capacity: {
            type: Number,
            default: 50,
        },
        rating_avg: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
            index: true,
        },
        rating_count: {
            type: Number,
            default: 0,
            min: 0,
        },
        verification_status: {
            type: String,
            enum: Object.values(VERIFICATION_STATUS),
            default: VERIFICATION_STATUS.PENDING,
            index: true,
        },
        verified_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        verified_at: Date,
        account_status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
            index: true,
        },
        store_deactivated_reason: {
            type: String,
            maxlength: 500,
        },
        deactivated_at: Date,
        deactivated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        last_login_at: Date,
        last_active_at: Date,

        status_updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        status_updated_at: Date,
    },
    { timestamps: true }
);

StoreSchema.index({ location: "2dsphere" });
StoreSchema.index({ service_area_id: 1, is_online: 1 });
StoreSchema.index({ account_status: 1, verification_status: 1 });
StoreSchema.index({ store_owner_id: 1 });

const syncStoreToRedis = async (doc) => {
    if (!doc) return;
    try {
        const { addStoreToRedis, removeStoreFromRedis } = await import(
            "../services/storeServices.js"
        );

        const shouldBeInRedis =
            doc.is_online &&
            doc.account_status === ACCOUNT_STATUS.ACTIVE &&
            doc.verification_status === VERIFICATION_STATUS.VERIFIED;

        if (shouldBeInRedis) {
            await addStoreToRedis(doc);
        } else {
            await removeStoreFromRedis(doc._id, doc.service_area_id);
        }

        // Invalidate profile & dashboard caches on any store modification
        const storeId = doc._id.toString();
        const { invalidateStoreCache } = await import("../constants/redis/invalidate/store.invalidate.js");
        await invalidateStoreCache(storeId).catch(err => {
            logger.error(`[Store Hook] Cache invalidation failed for ${storeId}:`, err.message);
        });
    } catch (err) {
        logger.error(`[Store Hook] Redis sync/cache invalidation failed for ${doc._id}:`, err.message);
    }
};

StoreSchema.post("save", function () { return syncStoreToRedis(this); });
StoreSchema.post("findOneAndUpdate", function (doc) { return syncStoreToRedis(doc); });

const Store = mongoose.model("Store", StoreSchema);
export default Store;