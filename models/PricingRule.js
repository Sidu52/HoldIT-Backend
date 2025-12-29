import mongoose from "mongoose";

const PricingRuleSchema = new mongoose.Schema(
  {
    basePickupFee: Number,
    perKmRate: Number,
    hourlyStorageRate: Number,
    peakMultiplier: Number,
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const PricingRule = mongoose.model("PricingRule", PricingRuleSchema);
export default PricingRule;