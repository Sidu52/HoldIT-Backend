import mongoose from "mongoose";

const BagSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            index: true,
        },
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            index: true,
        },
        pickup_driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            index: true,
        },
        delivery_driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            index: true,
        },
        qrCode: {
            type: String,
            unique: true,
        },
        size: {
            type: String,
            enum: ["SMALL", "MEDIUM", "LARGE", "OTHER"],
            required: true,
        },
        status: {
            type: String,
            enum: [
                "CREATED",
                "PICKED_UP",
                "IN_TRANSIT_TO_STORE",
                "STORED",
                "OUT_FOR_DELIVERY",
                "IN_TRANSIT_TO_USER",
                "DELIVERED",
                "LOST",
                "DAMAGED",
            ],
            default: "CREATED",
            index: true,
        },
        sealStatus: {
            type: Boolean,
            default: true,
        },
        seal_verified_at_pickup: {
            type: Boolean,
            default: null,
        },
        seal_verified_at_store: {
            type: Boolean,
            default: null,
        },
        seal_verified_at_delivery: {
            type: Boolean,
            default: null,
        },
        stored_at: Date,
        picked_up_at: Date,
        delivered_at: Date,
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        notes: {
            type: String,
            maxlength: 1000,
        },
        photos: {
            pickup: [{ type: String, maxlength: 500 }],
            store: [{ type: String, maxlength: 500 }],
            delivery: [{ type: String, maxlength: 500 }],
        },
    },
    { timestamps: true }
);

// Compound indexes
BagSchema.index({ bookingId: 1, status: 1 });
BagSchema.index({ storeId: 1, status: 1 });

const Bag = mongoose.model("Bag", BagSchema);
export default Bag;