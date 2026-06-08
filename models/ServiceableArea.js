import mongoose from "mongoose";

const serviceableAreaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    name_normalized: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    city_normalized: {
      type: String,
      trim: true,
      maxlength: 100,
      index: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    pincode: {
      type: String,
      maxlength: 10,
      index: true,
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
        validate: {
          validator: (coords) =>
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90,
          message: "Invalid coordinates",
        },
      },
    },

    service_radius_km: {
      type: Number,
      required: true,
      min: 0.1,
      max: 100,
      default: 5,
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
  { timestamps: true }
);

// Indexes
serviceableAreaSchema.index({ location: "2dsphere" });
serviceableAreaSchema.index(
  { name_normalized: 1, city_normalized: 1 },
  { unique: true }
);
serviceableAreaSchema.index({ is_active: 1, city_normalized: 1 });

// Pre-save normalization for uniqueness
serviceableAreaSchema.pre("validate", async function () {
  if (this.name) this.name_normalized = this.name.toLowerCase().trim();
  if (this.city) this.city_normalized = this.city.toLowerCase().trim();
});

export default mongoose.model("ServiceableArea", serviceableAreaSchema);