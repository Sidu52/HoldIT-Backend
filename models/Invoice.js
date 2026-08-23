import mongoose from "mongoose";

export const INVOICE_TYPE = Object.freeze({
    ADVANCE: "ADVANCE",
    FINAL: "FINAL",
    CREDIT_NOTE: "CREDIT_NOTE",
    DEBIT_NOTE: "DEBIT_NOTE",
});

export const INVOICE_STATUS = Object.freeze({
    ISSUED: "ISSUED",
    VOID: "VOID",
});

const LineItemSchema = new mongoose.Schema(
    {
        description: { type: String, required: true },
        hsnSac: { type: String, default: "996729" },
        amountMinor: { type: Number, required: true },
        taxableAmountMinor: { type: Number },
        taxAmountMinor: { type: Number, default: 0 },
        // Legacy compatibility field
        amount: { type: Number },
    },
    { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: { type: String, required: true, unique: true, index: true },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: Object.values(INVOICE_TYPE), required: true, index: true },
        status: { type: String, enum: Object.values(INVOICE_STATUS), default: INVOICE_STATUS.ISSUED, index: true },

        seller: {
            legalName: { type: String, default: "Holdit Logistics Vaults Pvt Ltd" },
            gstin: { type: String, default: "27AAAAA0000A1Z5" },
            address: { type: String, default: "Main Hub, Mumbai, Maharashtra" },
        },

        buyer: {
            name: String,
            phone: String,
            gstin: { type: String, default: null },
        },

        lineItems: [LineItemSchema],

        subtotalMinor: { type: Number, required: true },
        discountMinor: { type: Number, default: 0 },
        taxableAmountMinor: { type: Number, required: true },

        taxMode: { type: String, default: "EXCLUSIVE" },
        taxRate: { type: Number, default: 18 },
        cgstRate: { type: Number, default: 9 },
        sgstRate: { type: Number, default: 9 },
        igstRate: { type: Number, default: 0 },

        cgstAmountMinor: { type: Number, default: 0 },
        sgstAmountMinor: { type: Number, default: 0 },
        igstAmountMinor: { type: Number, default: 0 },
        taxAmountMinor: { type: Number, default: 0 },

        totalAmountMinor: { type: Number, required: true },

        // Legacy compatibility major unit fields
        subtotal: Number,
        cgstAmount: Number,
        sgstAmount: Number,
        igstAmount: Number,
        totalAmount: Number,

        currency: { type: String, default: "INR" },
        issuedAt: { type: Date, default: Date.now },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

InvoiceSchema.index({ bookingId: 1, type: 1, paymentId: 1 }, { unique: true });

export default mongoose.model("Invoice", InvoiceSchema);