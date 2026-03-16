import mongoose from "mongoose";

const PricingRuleSchema = new mongoose.Schema(
    {
        //  Different areas have different pricing.
        name: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        service_area_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            index: true,
        },
        basePickupFee: {
            type: Number,
            required: true,
            min: 0,
        },
        perKmRate: {
            type: Number,
            required: true,
            min: 0,
        },
        hourlyStorageRate: {
            type: Number,
            required: true,
            min: 0,
        },
        peakMultiplier: {
            type: Number,
            default: 1.0,
            min: 1.0,
        },
        active: {
            type: Boolean,
            default: true,
            index: true,
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    { timestamps: true }
);

PricingRuleSchema.index(
    { service_area_id: 1, active: 1 },
    {
        unique: true,
        partialFilterExpression: { active: true },
    }
);

const PricingRule = mongoose.model("PricingRule", PricingRuleSchema);
export default PricingRule;