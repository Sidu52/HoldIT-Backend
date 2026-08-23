import Money from "./money.js";

export const TAX_MODE = Object.freeze({
    EXCLUSIVE: "EXCLUSIVE",
    INCLUSIVE: "INCLUSIVE",
    EXEMPT: "EXEMPT",
});

//Computes taxable subtotal, CGST, SGST, IGST, and total payable in minor units.

export function calculateTax(amountMinor, taxConfig = {}) {
    const {
        taxMode = TAX_MODE.EXCLUSIVE,
        taxRate = 18, // percentage e.g. 18
        cgstRate = 9,
        sgstRate = 9,
        igstRate = 0,
        isInterstate = false,
    } = taxConfig;

    Money.assertNonNegative(amountMinor, "Base amount");

    if (taxMode === TAX_MODE.EXEMPT || taxRate <= 0) {
        return {
            subtotalMinor: amountMinor,
            taxableAmountMinor: amountMinor,
            taxAmountMinor: 0,
            cgstAmountMinor: 0,
            sgstAmountMinor: 0,
            igstAmountMinor: 0,
            totalAmountMinor: amountMinor,
            taxMode,
            taxRate: 0,
            cgstRate: 0,
            sgstRate: 0,
            igstRate: 0,
        };
    }

    let taxableAmountMinor = 0;
    let taxAmountMinor = 0;

    if (taxMode === TAX_MODE.INCLUSIVE) {
        // Amount provided includes tax: total = taxable * (1 + rate/100)
        taxableAmountMinor = Money.round(amountMinor / (1 + taxRate / 100));
        taxAmountMinor = Money.subtract(amountMinor, taxableAmountMinor);
    } else {
        // EXCLUSIVE: Amount provided is pre-tax subtotal
        taxableAmountMinor = amountMinor;
        taxAmountMinor = Money.percentage(taxableAmountMinor, taxRate);
    }

    let cgstAmountMinor = 0;
    let sgstAmountMinor = 0;
    let igstAmountMinor = 0;

    if (isInterstate || igstRate > 0) {
        igstAmountMinor = taxAmountMinor;
    } else {
        cgstAmountMinor = Money.round(taxAmountMinor / 2);
        sgstAmountMinor = Money.subtract(taxAmountMinor, cgstAmountMinor); // ensure exact sum
    }

    const totalAmountMinor = taxMode === TAX_MODE.INCLUSIVE
        ? amountMinor
        : Money.add(taxableAmountMinor, taxAmountMinor);

    return {
        subtotalMinor: taxableAmountMinor,
        taxableAmountMinor,
        taxAmountMinor,
        cgstAmountMinor,
        sgstAmountMinor,
        igstAmountMinor,
        totalAmountMinor,
        taxMode,
        taxRate,
        cgstRate: isInterstate ? 0 : cgstRate,
        sgstRate: isInterstate ? 0 : sgstRate,
        igstRate: isInterstate ? taxRate : igstRate,
    };
}
