import mongoose from "mongoose";

const serviceableAreaSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        city: {
            type: String,
            required: true,
            trim: true,
        },

        state: {
            type: String,
            required: true,
            trim: true,
        },

        pincode: {
            type: String,
            index: true,
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                required: true,
                default: "Point",
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: true,
            },
        },

        service_radius_km: {
            type: Number,
            required: true,
            default: 5,
        },

        delivery_charge: {
            type: Number,
            default: 0,
        },

        is_active: {
            type: Boolean,
            default: true,
        },

        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    {
        timestamps: true,
    }
);


serviceableAreaSchema.index({ location: "2dsphere" });

export default mongoose.model("ServiceableArea", serviceableAreaSchema);
