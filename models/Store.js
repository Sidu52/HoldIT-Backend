import mongoose from "mongoose";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../utils/constants.js";

const StoreSchema = new mongoose.Schema(
  {
    store_name: { type: String, index: true, required: true },
    store_address: String,
    store_open_time: String,
    store_close_time: String,
    store_description: String,
    location: {
      type: { type: String, enum: ["Point"], default: "Point", required: true },
      coordinates: { type: [Number], required: true },
      address: String
    },
    service_area_id: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceArea", index: true },
    is_online: { type: Boolean, default: true, index: true },
    verification_status: { type: String, enum: Object.values(VERIFICATION_STATUS), default: VERIFICATION_STATUS.PENDING, index: true },
    status: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.PENDING, index: true },
    booking_assigned_count: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    last_active_at: { type: Date, index: true },

    // Relation to StoreOwner
    store_owner_id: { type: mongoose.Schema.Types.ObjectId, ref: "StoreOwner", required: true, index: true }
  },
  { timestamps: true }
);

// Geo index
StoreSchema.index({ location: "2dsphere" });

const Store = mongoose.model("Store", StoreSchema);
export default Store;
