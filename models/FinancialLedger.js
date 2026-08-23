import mongoose from "mongoose";

const LedgerEntrySchema = new mongoose.Schema(
    {
        financialEventId: { type: String, required: true },
        account: {
            type: String,
            enum: [
                "CUSTOMER_PAYMENT",
                "TAX_LIABILITY",
                "DRIVER_PAYABLE",
                "STORE_PAYABLE",
                "HOLDIT_REVENUE",
                "REFUND",
                "GATEWAY_FEE",
                "ADJUSTMENT",
            ],
            required: true,
        },
        entryType: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
        amountMinor: { type: Number, required: true, min: 0 },
        currency: { type: String, default: "INR" },
        reference: String,
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const FinancialLedgerSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            unique: true,
            index: true,
        },
        bookingCode: { type: String, required: true },

        storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", index: true },
        storeOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreOwner", index: true },

        pickupDriverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", index: true },
        returnDriverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", index: true },

        // Minor Unit Financial Breakdown (Paise)
        grossCollectedMinor: { type: Number, required: true, min: 0 },
        netCustomerCollectedMinor: { type: Number, required: true, min: 0 },
        refundedMinor: { type: Number, default: 0, min: 0 },

        // Breakdown splits in minor units
        taxReserveMinor: {
            cgstMinor: { type: Number, default: 0 },
            sgstMinor: { type: Number, default: 0 },
            igstMinor: { type: Number, default: 0 },
            totalTaxMinor: { type: Number, default: 0 },
        },

        driver1PayableMinor: { type: Number, default: 0 },
        storePayableMinor: { type: Number, default: 0 },
        driver2PayableMinor: { type: Number, default: 0 },

        holditRevenueMinor: {
            platformFeeMinor: { type: Number, default: 0 },
            handlingFeeMinor: { type: Number, default: 0 },
            packingFeeMinor: { type: Number, default: 0 },
            storageMarginMinor: { type: Number, default: 0 },
            totalNetRevenueMinor: { type: Number, default: 0 },
        },

        isReconciled: { type: Boolean, default: false },
        reconciledAt: Date,
        reconciliationDiscrepancyMinor: { type: Number, default: 0 },

        entries: [LedgerEntrySchema],

        // Legacy compatibility major unit fields
        grossCollected: { type: Number, min: 0 },
        storePayout: {
            storageCharge: { type: Number, default: 0 },
            commissionDeducted: { type: Number, default: 0 },
            netPayout: { type: Number, default: 0 },
            status: { type: String, default: "PENDING" },
            disbursedAt: Date,
        },
        pickupDriverPayout: {
            deliveryFee: { type: Number, default: 0 },
            tipAmount: { type: Number, default: 0 },
            netPayout: { type: Number, default: 0 },
            status: { type: String, default: "PENDING" },
            disbursedAt: Date,
        },
        returnDriverPayout: {
            deliveryFee: { type: Number, default: 0 },
            tipAmount: { type: Number, default: 0 },
            netPayout: { type: Number, default: 0 },
            status: { type: String, default: "PENDING" },
            disbursedAt: Date,
        },
        holditProfit: {
            platformFee: { type: Number, default: 0 },
            handlingFee: { type: Number, default: 0 },
            packingFee: { type: Number, default: 0 },
            storeCommission: { type: Number, default: 0 },
            totalNetProfit: { type: Number, default: 0 },
        },
        taxReserve: {
            cgstAmount: { type: Number, default: 0 },
            sgstAmount: { type: Number, default: 0 },
            totalTax: { type: Number, default: 0 },
        },
    },
    { timestamps: true }
);

FinancialLedgerSchema.index({ storeOwnerId: 1 });
FinancialLedgerSchema.index({ pickupDriverId: 1 });
FinancialLedgerSchema.index({ returnDriverId: 1 });

const FinancialLedger = mongoose.model("FinancialLedger", FinancialLedgerSchema);
export default FinancialLedger;
