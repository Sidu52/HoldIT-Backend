import mongoose from "mongoose";
import Invoice, { INVOICE_TYPE, INVOICE_STATUS } from "../../models/Invoice.js";
import Payment, { PAYMENT_STATUS } from "../../models/Payment.js";
import Booking from "../../models/Booking.js";
import Counter from "../../models/Counter.js";
import Money from "../../utils/money.js";
import { calculateTax } from "../../utils/tax.js";
import logger from "../../utils/logger.js";

const SAC_CODE = "996729";

export async function getNextInvoiceNumber(session) {
    const now = new Date();
    const fyLabel =
        now.getMonth() >= 3
            ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
            : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;

    const counter = await Counter.findOneAndUpdate(
        { _id: `invoice-${fyLabel}` },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
    );

    return `INV/${fyLabel}/${String(counter.seq).padStart(6, "0")}`;
}

export function buildInvoiceLineItemsMinor(payment, booking) {
    const paymentTypeUpper = (payment.type || "").toUpperCase();

    if (paymentTypeUpper === "ADVANCE") {
        const paymentAmountMinor = payment.amountMinor || Money.fromMajor(payment.amount || 0);
        return [
            {
                description: "Advance booking fee (Pickup Transfer & Platform Fees)",
                hsnSac: SAC_CODE,
                amountMinor: paymentAmountMinor,
                amount: Money.fromMinor(paymentAmountMinor),
            },
        ];
    }

    // FINAL
    const snapshot = booking.pricing?.pricingSnapshot || {};
    const storageHours = booking.pricing?.storageHours ?? 0;
    const customerRateMinor = snapshot.customerStorageHourlyRateMinor || Money.fromMajor(booking.pricing?.perHourRate || 0);
    const storageFeeMinor = Money.round(storageHours * customerRateMinor);
    const returnDistanceChargeMinor = Money.fromMajor(booking.pricing?.distanceCharge || 0);

    const lineItems = [
        {
            description: `Luggage storage fee (${storageHours} hrs @ ₹${Money.fromMinor(customerRateMinor)}/hr)`,
            hsnSac: SAC_CODE,
            amountMinor: storageFeeMinor,
            amount: Money.fromMinor(storageFeeMinor),
        },
    ];

    if (returnDistanceChargeMinor > 0) {
        lineItems.push({
            description: "Return delivery transfer fee",
            hsnSac: SAC_CODE,
            amountMinor: returnDistanceChargeMinor,
            amount: Money.fromMinor(returnDistanceChargeMinor),
        });
    }

    return lineItems;
}

export async function generateInvoiceForPayment(paymentId, session = null) {
    const existing = await Invoice.findOne({ paymentId }).session(session).lean();
    if (existing) {
        return { invoice: existing, created: false };
    }

    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) {
        throw new Error(`[generateInvoiceForPayment] Payment ${paymentId} not found`);
    }
    if (payment.status !== PAYMENT_STATUS.CAPTURED) {
        throw new Error(`[generateInvoiceForPayment] Refusing to invoice Payment ${paymentId} with status '${payment.status}'`);
    }

    const booking = await Booking.findById(payment.bookingId).session(session);
    if (!booking) {
        throw new Error(`[generateInvoiceForPayment] Booking ${payment.bookingId} not found for payment ${paymentId}`);
    }

    const snapshot = booking.pricing?.pricingSnapshot || {};
    const lineItems = buildInvoiceLineItemsMinor(payment, booking);

    const subtotalMinor = lineItems.reduce((sum, item) => Money.add(sum, item.amountMinor), 0);

    const taxResult = calculateTax(subtotalMinor, {
        taxMode: snapshot.taxMode || "EXCLUSIVE",
        taxRate: snapshot.taxRate ?? 18,
        cgstRate: snapshot.cgstRate ?? 9,
        sgstRate: snapshot.sgstRate ?? 9,
        igstRate: snapshot.igstRate ?? 0,
    });

    const invoiceNumber = await getNextInvoiceNumber(session);
    const paymentTypeUpper = (payment.type || "").toUpperCase();

    const invoiceDoc = {
        invoiceNumber,
        bookingId: booking._id,
        paymentId: payment._id,
        userId: payment.userId,
        type: paymentTypeUpper === "ADVANCE" ? INVOICE_TYPE.ADVANCE : INVOICE_TYPE.FINAL,
        status: INVOICE_STATUS.ISSUED,
        buyer: {
            name: `${booking.userInfo?.firstName ?? ""} ${booking.userInfo?.lastName ?? ""}`.trim() || "Customer",
            phone: booking.userInfo?.phone ?? "",
        },
        lineItems,
        subtotalMinor: taxResult.subtotalMinor,
        discountMinor: 0,
        taxableAmountMinor: taxResult.taxableAmountMinor,
        taxMode: taxResult.taxMode,
        taxRate: taxResult.taxRate,
        cgstRate: taxResult.cgstRate,
        sgstRate: taxResult.sgstRate,
        igstRate: taxResult.igstRate,
        cgstAmountMinor: taxResult.cgstAmountMinor,
        sgstAmountMinor: taxResult.sgstAmountMinor,
        igstAmountMinor: taxResult.igstAmountMinor,
        taxAmountMinor: taxResult.taxAmountMinor,
        totalAmountMinor: taxResult.totalAmountMinor,

        // Legacy compatibility fields
        subtotal: Money.fromMinor(taxResult.subtotalMinor),
        cgstAmount: Money.fromMinor(taxResult.cgstAmountMinor),
        sgstAmount: Money.fromMinor(taxResult.sgstAmountMinor),
        igstAmount: Money.fromMinor(taxResult.igstAmountMinor),
        totalAmount: Money.fromMinor(taxResult.totalAmountMinor),
        currency: payment.currency || "INR",
        issuedAt: new Date(),
    };

    try {
        const [created] = await Invoice.create([invoiceDoc], { session });
        return { invoice: created, created: true };
    } catch (err) {
        if (err?.code === 11000) {
            logger.warn(`[generateInvoiceForPayment] Duplicate invoice create for payment ${paymentId} — returning existing.`);
            const alreadyCreated = await Invoice.findOne({ paymentId }).session(session).lean();
            if (alreadyCreated) {
                return { invoice: alreadyCreated, created: false };
            }
            throw new Error(`[generateInvoiceForPayment] Duplicate key on invoice for payment ${paymentId} but no existing invoice found`);
        }
        throw err;
    }
}