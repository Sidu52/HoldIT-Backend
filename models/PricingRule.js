import mongoose from "mongoose";

const PricingRuleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            maxlength: 100,
            required: true,
        },
        serviceAreaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            required: true,
            index: true,
        },

        feeBreakdown: {
            platformFee: { type: Number, required: true, min: 0 },
            handlingFee: { type: Number, default: 0, min: 0 },
            packingFee: { type: Number, default: 0, min: 0 },
        },

        perKmRate: { type: Number, required: true, min: 0 },
        maxAdvanceDistanceKm: { type: Number, default: 15 },

        returnFeeBreakdown: {
            platformFee: { type: Number, required: true, min: 0 },
        },

        bagPricing: {
            small: {
                basePrice: { type: Number, default: 49, min: 0 },
                hourlyRate: { type: Number, default: 15, min: 0 },
            },
            medium: {
                basePrice: { type: Number, default: 99, min: 0 },
                hourlyRate: { type: Number, default: 25, min: 0 },
            },
            large: {
                basePrice: { type: Number, default: 149, min: 0 },
                hourlyRate: { type: Number, default: 40, min: 0 },
            },
            other: {
                basePrice: { type: Number, default: 199, min: 0 },
                hourlyRate: { type: Number, default: 50, min: 0 },
            },
        },

        hourlyStorageRate: {
            type: Number,
            required: true,
            min: 0,
        },
        minChargeableHours: {
            type: Number,
            default: 1,
            min: 0,
        },
        maxDailyRate: {
            type: Number,
            min: 0,
            default: null,
        },

        freeStorageHours: {
            type: Number,
            default: 0,
            min: 0,
        },

        peakMultiplier: {
            type: Number,
            default: 1.0,
            min: 1.0,
        },
        peakHours: {
            startHour: { type: Number, min: 0, max: 23, default: null },
            endHour: { type: Number, min: 0, max: 23, default: null },
        },

        afterHoursSurcharge: {
            type: Number,
            default: 0,
            min: 0,
        },

        gst: {
            ratePercent: { type: Number, required: true, min: 0, max: 100, default: 18 },
            inclusive: { type: Boolean, default: false },
        },

        commissionSplit: {
            pickupFee: { vendorSharePercent: { type: Number, min: 0, max: 100, default: 80 } },
            deliveryFee: { vendorSharePercent: { type: Number, min: 0, max: 100, default: 80 } },
            storageFee: { vendorSharePercent: { type: Number, min: 0, max: 100, default: 70 } },
        },

        currency: {
            type: String,
            default: "INR",
            maxlength: 3,
        },

        active: {
            type: Boolean,
            default: true,
            index: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        deactivatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        deactivatedAt: { type: Date, default: null },
        deactivationReason: { type: String, maxlength: 300, default: null },
    },
    { timestamps: true }
);

PricingRuleSchema.index(
    { serviceAreaId: 1, active: 1 },
    { unique: true, partialFilterExpression: { active: true } }
);

PricingRuleSchema.statics.replaceActiveRule = async function (serviceAreaId, newRuleData, adminId, session) {
    const PricingRule = this;

    const existing = await PricingRule.findOne({ serviceAreaId, active: true }).session(session);
    if (existing) {
        existing.active = false;
        existing.deactivatedBy = adminId;
        existing.deactivatedAt = new Date();
        existing.deactivationReason = newRuleData.deactivationReason || "Replaced by new rate";
        await existing.save({ session });
    }

    const [created] = await PricingRule.create(
        [{ ...newRuleData, serviceAreaId, createdBy: adminId, active: true }],
        { session }
    );

    return created;
};

PricingRuleSchema.statics.getActiveRule = function (serviceAreaId) {
    return this.findOne({ serviceAreaId, active: true });
};

const PricingRule = mongoose.model("PricingRule", PricingRuleSchema);
export default PricingRule;