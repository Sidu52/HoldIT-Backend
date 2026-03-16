import mongoose from "mongoose";

const serviceableAreaSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        city: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
            index: true,
        },
        state: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
            index: true,
        },
        pincode: {
            type: String,
            index: true,
            maxlength: 10,
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                required: true,
                default: "Point",
            },
            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator: function (coords) {
                        return (
                            coords.length === 2 &&
                            coords[0] >= -180 && coords[0] <= 180 &&
                            coords[1] >= -90 && coords[1] <= 90
                        );
                    },
                    message: "Invalid coordinates. Format: [longitude, latitude]",
                },
            },
        },
        service_radius_km: {
            type: Number,
            required: true,
            default: 5,
            min: 0.1,
            max: 100,
        },
        delivery_charge: {
            type: Number,
            default: 0,
            min: 0,
        },
        is_active: {
            type: Boolean,
            default: true,
            index: true,
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    {
        timestamps: true,
    }
);

serviceableAreaSchema.index({ location: "2dsphere" });
serviceableAreaSchema.index({ is_active: 1, city: 1 });
serviceableAreaSchema.index({ name: 1, city: 1 }, { unique: true });

export default mongoose.model("ServiceableArea", serviceableAreaSchema);