export class Money {

    //convert major units (rupees) to integer minor units (paise)
    static fromMajor(majorAmount) {
        if (typeof majorAmount !== "number" || !Number.isFinite(majorAmount)) {
            throw new Error(`[Money.fromMajor] Invalid major amount: ${majorAmount}`);
        }
        return Math.round(majorAmount * 100);
    }

   //convert integer minor units (paise) to major units (rupees)
    static fromMinor(minorAmount) {
        if (typeof minorAmount !== "number" || !Number.isInteger(minorAmount)) {
            minorAmount = Math.round(minorAmount || 0);
        }
        return +(minorAmount / 100).toFixed(2);
    }

    //converts a legacy record field to minor units safely
    static legacyMoneyToMinor(doc, fieldName = "amount", minorFieldName = `${fieldName}Minor`) {
        if (!doc) return 0;
        if (typeof doc[minorFieldName] === "number" && Number.isInteger(doc[minorFieldName])) {
            return doc[minorFieldName];
        }
        if (typeof doc[fieldName] === "number" && Number.isFinite(doc[fieldName])) {
            return Math.round(doc[fieldName] * 100);
        }
        return 0;
    }

    static add(aMinor, bMinor) {
        return Math.round(aMinor || 0) + Math.round(bMinor || 0);
    }

    static subtract(aMinor, bMinor) {
        return Math.round(aMinor || 0) - Math.round(bMinor || 0);
    }

    static multiply(amountMinor, factor) {
        return Math.round((amountMinor || 0) * factor);
    }

    static percentage(amountMinor, percentRate) {
        return Math.round(((amountMinor || 0) * percentRate) / 100);
    }

    static round(amount) {
        return Math.round(amount || 0);
    }

    static assertNonNegative(amountMinor, label = "Amount") {
        if (typeof amountMinor !== "number" || amountMinor < 0) {
            throw new Error(`[Money] ${label} must be a non-negative integer minor unit. Got: ${amountMinor}`);
        }
    }
}

export default Money;
