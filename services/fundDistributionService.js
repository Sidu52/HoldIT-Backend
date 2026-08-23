// import Booking from "../models/Booking.js";
import Store from "../models/Store.js";
import Payment, { PAYMENT_STATUS, PAYMENT_TYPE } from "../models/Payment.js";
import FinancialLedger from "../models/FinancialLedger.js";
import Earning, { EARNING_RECIPIENT, EARNING_PURPOSE, EARNING_STATUS } from "../models/Earning.js";
import PaymentDistribution from "../models/PaymentDistribution.js";
import Money from "../utils/money.js";
import PricingService from "./pricingService.js";
import logger from "../utils/logger.js";

const DEFAULT_PICKUP_VENDOR_SHARE_PERCENT = 80;
const DEFAULT_DELIVERY_VENDOR_SHARE_PERCENT = 80;

/**
 * Splits a gross fee between vendor (driver/store) and platform per the
 * commission rate snapshotted on the booking at pricing time
 * (plan Section 4.1 — PricingRule.commissionSplit).
 *
 * Falls back to the given default if the snapshot doesn't carry a rate,
 * so older bookings priced before commissionSplit existed don't break.
 */
function splitByVendorShare(grossMinor, vendorSharePercent, fallbackPercent) {
    const pct = typeof vendorSharePercent === "number" ? vendorSharePercent : fallbackPercent;
    const netEarningMinor = Money.round((grossMinor * pct) / 100);
    const commissionMinor = Money.subtract(grossMinor, netEarningMinor);
    return { netEarningMinor, commissionMinor };
}

/**
 * Records Vendor Earnings when Advance Payment is Captured
 * - Driver 1 Earning (Pickup) -> status: PENDING
 * - Store Owner Earning Allocation -> status: PENDING
 */
export async function processAdvancePaymentDistribution(paymentId) {
    const payment = await Payment.findById(paymentId);
    if (!payment || payment.type !== PAYMENT_TYPE.ADVANCE || payment.status !== PAYMENT_STATUS.CAPTURED) {
        return null;
    }

    const booking = await Booking.findById(payment.bookingId).lean();
    if (!booking) return null;

    let storeOwnerId = null;
    if (booking.storeId) {
        const store = await Store.findById(booking.storeId).select("store_owner_id").lean();
        storeOwnerId = store?.store_owner_id || null;
    }

    const pickupDriverId = booking.pickup?.assignment?.driverId || null;
    const snapshot = booking.pricing?.pricingSnapshot || {};
    const advanceBreakdown = booking.pricing?.advanceBreakdown || {};
    const pickupFeeMinor = Money.fromMajor(advanceBreakdown.deliveryFee || 30);

    // Pickup-leg tip only. Do NOT fall back to a combined booking.tipAmount —
    // that would double-count against the return leg's own tip field.
    const pickupTipMinor = Money.fromMajor(booking.pickupTipAmount || 0);

    const { netEarningMinor: pickupNetMinor, commissionMinor: pickupCommissionMinor } = splitByVendorShare(
        pickupFeeMinor,
        snapshot.pickupVendorSharePercent,
        DEFAULT_PICKUP_VENDOR_SHARE_PERCENT
    );

    const earnings = [];

    // Driver 1 Pickup Earning
    if (pickupDriverId) {
        const driverEventId = `DRIVER_PICKUP:${booking._id}`;
        let driverEarning = await Earning.findOne({ financialEventId: driverEventId });
        if (!driverEarning) {
            driverEarning = await Earning.create({
                financialEventId: driverEventId,
                bookingId: booking._id,
                paymentId: payment._id,
                recipientType: EARNING_RECIPIENT.DRIVER,
                recipientId: pickupDriverId,
                driverId: pickupDriverId,
                purpose: EARNING_PURPOSE.PICKUP,
                grossAmountMinor: Money.add(pickupFeeMinor, pickupTipMinor),
                commissionAmountMinor: pickupCommissionMinor, // platform's cut on the fee only
                taxDeductionMinor: 0,
                netEarningMinor: Money.add(pickupNetMinor, pickupTipMinor), // tip is never commissioned
                status: EARNING_STATUS.PENDING,
            });
        }
        earnings.push(driverEarning);

        // Legacy compatibility PaymentDistribution record
        await PaymentDistribution.findOneAndUpdate(
            { bookingId: booking._id, purpose: "PICKUP" },
            {
                paymentId: payment._id,
                bookingId: booking._id,
                recipientType: "DRIVER",
                recipientId: pickupDriverId,
                driverId: pickupDriverId,
                amount: Money.fromMinor(driverEarning.netEarningMinor),
                purpose: "PICKUP",
                status: "PENDING",
            },
            { upsert: true, new: true }
        );
    }

    // Store Owner Storage Allocation Earning
    // PricingService.calculateStorageEarningAmounts already returns a
    // commission-aware split (customer rate vs store rate) — unchanged.
    if (storeOwnerId) {
        const storeEventId = `STORE_STORAGE:${booking._id}`;
        let storeEarning = await Earning.findOne({ financialEventId: storeEventId });
        if (!storeEarning) {
            const estimatedHours = booking.pricing?.storageHours || booking.storage?.expectedDurationHours || 1;
            const amounts = PricingService.calculateStorageEarningAmounts(snapshot, estimatedHours);

            storeEarning = await Earning.create({
                financialEventId: storeEventId,
                bookingId: booking._id,
                paymentId: payment._id,
                recipientType: EARNING_RECIPIENT.STORE_OWNER,
                recipientId: storeOwnerId,
                storeId: booking.storeId,
                purpose: EARNING_PURPOSE.STORAGE,
                grossAmountMinor: amounts.grossAmountMinor,
                commissionAmountMinor: amounts.commissionAmountMinor,
                taxDeductionMinor: amounts.taxDeductionMinor,
                netEarningMinor: amounts.netEarningMinor,
                isEstimate: true,
                status: EARNING_STATUS.PENDING,
            });
        }
        earnings.push(storeEarning);

        // Legacy compatibility PaymentDistribution record
        await PaymentDistribution.findOneAndUpdate(
            { bookingId: booking._id, purpose: "STORAGE" },
            {
                paymentId: payment._id,
                bookingId: booking._id,
                recipientType: "STORE_OWNER",
                recipientId: storeOwnerId,
                storeId: booking.storeId,
                amount: Money.fromMinor(storeEarning.netEarningMinor),
                purpose: "STORAGE",
                status: "PENDING",
            },
            { upsert: true, new: true }
        );
    }

    return earnings;
}

/**
 * Records Vendor Earning when Final Payment is Captured
 * - Driver 2 Earning (Return Delivery) -> status: PENDING
 */
export async function processFinalPaymentDistribution(paymentId) {
    const payment = await Payment.findById(paymentId);
    if (!payment || payment.type !== PAYMENT_TYPE.FINAL || payment.status !== PAYMENT_STATUS.CAPTURED) {
        return null;
    }

    const booking = await Booking.findById(payment.bookingId).lean();
    if (!booking) return null;

    const returnDriverId = booking.delivery?.assignment?.driverId || null;
    const snapshot = booking.pricing?.pricingSnapshot || {};
    const returnFeeMinor = Money.fromMajor(booking.pricing?.distanceCharge || 30);

    // Return-leg tip — separate field from the pickup-leg tip. Per plan
    // Section 3.2, a Phase-2 tip is 100% Driver-2's and must not be
    // conflated with (or overwritten by) the pickup-leg tip.
    const returnTipMinor = Money.fromMajor(booking.returnTipAmount || 0);

    const { netEarningMinor: returnNetMinor, commissionMinor: returnCommissionMinor } = splitByVendorShare(
        returnFeeMinor,
        snapshot.deliveryVendorSharePercent,
        DEFAULT_DELIVERY_VENDOR_SHARE_PERCENT
    );

    if (!returnDriverId) {
        return null;
    }

    const returnEventId = `DRIVER_RETURN:${booking._id}`;
    let returnEarning = await Earning.findOne({ financialEventId: returnEventId });
    if (!returnEarning) {
        returnEarning = await Earning.create({
            financialEventId: returnEventId,
            bookingId: booking._id,
            paymentId: payment._id,
            recipientType: EARNING_RECIPIENT.DRIVER,
            recipientId: returnDriverId,
            driverId: returnDriverId,
            purpose: EARNING_PURPOSE.RETURN_DELIVERY,
            grossAmountMinor: Money.add(returnFeeMinor, returnTipMinor),
            commissionAmountMinor: returnCommissionMinor,
            taxDeductionMinor: 0,
            netEarningMinor: Money.add(returnNetMinor, returnTipMinor),
            status: EARNING_STATUS.PENDING, // Earning is PENDING until final delivery completes!
        });
    }

    // Legacy compatibility PaymentDistribution record
    await PaymentDistribution.findOneAndUpdate(
        { bookingId: booking._id, purpose: "RETURN_DELIVERY" },
        {
            paymentId: payment._id,
            bookingId: booking._id,
            recipientType: "DRIVER",
            recipientId: returnDriverId,
            driverId: returnDriverId,
            amount: Money.fromMinor(returnEarning.netEarningMinor),
            purpose: "RETURN_DELIVERY",
            status: "PENDING",
        },
        { upsert: true, new: true }
    );

    return returnEarning;
}

/**
 * Updates Earning state machine upon operational completions.
 */
export async function updateEarningStatus(bookingId, purpose, targetStatus, session = null) {
    const filter = { bookingId, purpose };
    const update = { status: targetStatus };

    if (targetStatus === EARNING_STATUS.ELIGIBLE) {
        update.eligibleAt = new Date();
    } else if (targetStatus === EARNING_STATUS.PAYABLE) {
        update.payableAt = new Date();
    } else if (targetStatus === EARNING_STATUS.PAID) {
        update.paidAt = new Date();
    }

    if (purpose === EARNING_PURPOSE.STORAGE) {
        const booking = await Booking.findById(bookingId).lean();
        if (booking) {
            const snapshot = booking.pricing?.pricingSnapshot || {};
            const startedAt = booking.storage?.startedAt || booking.storage?.storedAt || booking.createdAt;
            const releasedAt = booking.storage?.releasedAt || new Date();

            const storageCalc = PricingService.calculateStorageCharge(
                {
                    customerStorageHourlyRateMinor:
                        snapshot.customerStorageHourlyRateMinor || Money.fromMajor(booking.pricing?.perHourRate || 20),
                    storeStorageHourlyRateMinor:
                        snapshot.storeStorageHourlyRateMinor || Money.fromMajor((booking.pricing?.perHourRate || 20) * 0.7),
                    minimumChargeableHours: snapshot.minimumChargeableHours || 1,
                    maximumDailyRateMinor: snapshot.maximumDailyRateMinor || null,
                    peakMultiplier: snapshot.peakMultiplier || 1.0,
                    peakHours: snapshot.peakHours || { startHour: null, endHour: null },
                },
                startedAt,
                releasedAt
            );

            update.grossAmountMinor = storageCalc.grossAmountMinor || storageCalc.storeEarningMinor;
            update.commissionAmountMinor = storageCalc.commissionAmountMinor || 0;
            update.taxDeductionMinor = storageCalc.taxDeductionMinor || 0;
            update.netEarningMinor = storageCalc.netEarningMinor || storageCalc.storeEarningMinor;
            update.isEstimate = false;
        }
    }

    const earning = await Earning.findOneAndUpdate(filter, { $set: update }, { new: true, session });
    if (earning) {
        const legacyStatusMap = {
            PENDING: "PENDING",
            ELIGIBLE: "PENDING",
            PAYABLE: "SETTLED",
            PAID: "DISBURSED",
        };
        await PaymentDistribution.updateOne(
            { bookingId, purpose },
            { $set: { status: legacyStatusMap[targetStatus] || "PENDING", amount: Money.fromMinor(earning.netEarningMinor) } },
            { session }
        );
    }
    return earning;
}

/**
 * Senior Financial Engine: Reconciles booking payments, records double-entry ledger items,
 * and calculates Holdit net revenue.
 *
 * Vendor payables/commissions are sourced from the Earning records created in
 * processAdvancePaymentDistribution / processFinalPaymentDistribution / updateEarningStatus —
 * NOT recomputed here — so there is a single source of truth for what each
 * vendor is owed. This function's own math (tax base, reconciliation) only
 * reads gross fee amounts from booking.pricing, which is the same snapshot
 * those Earning records were built from.
 */
export async function processBookingFundDistribution(bookingId) {
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) {
        throw new Error(`[processBookingFundDistribution] Booking ${bookingId} not found`);
    }

    let existingLedger = await FinancialLedger.findOne({ bookingId: booking._id });

    const payments = await Payment.find({
        bookingId: booking._id,
        status: { $in: [PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED] },
    }).lean();

    const grossCollectedMinor = payments.reduce((sum, p) => {
        const amt = p.amountMinor || Money.fromMajor(p.amount || 0);
        return Money.add(sum, amt);
    }, 0);

    const totalRefundedMinor = payments.reduce((sum, p) => {
        const ref = p.amountRefundedMinor || Money.fromMajor(p.amountRefunded || 0);
        return Money.add(sum, ref);
    }, 0);

    const netCustomerCollectedMinor = Money.subtract(grossCollectedMinor, totalRefundedMinor);

    let storeOwnerId = null;
    if (booking.storeId) {
        const store = await Store.findById(booking.storeId).select("store_owner_id").lean();
        storeOwnerId = store?.store_owner_id || null;
    }

    const snapshot = booking.pricing?.pricingSnapshot || {};
    const startedAt = booking.storage?.startedAt || booking.storage?.storedAt || booking.createdAt;
    const releasedAt = booking.storage?.releasedAt || booking.delivery?.assignment?.completedAt || new Date();

    // Used only for the GST taxable base (customer-facing storage fee),
    // not for vendor payout — payout comes from the Earning record below.
    const storageCalc = PricingService.calculateStorageCharge(
        {
            customerStorageHourlyRateMinor:
                snapshot.customerStorageHourlyRateMinor || Money.fromMajor(booking.pricing?.perHourRate || 20),
            storeStorageHourlyRateMinor:
                snapshot.storeStorageHourlyRateMinor || Money.fromMajor((booking.pricing?.perHourRate || 20) * 0.7),
            minimumChargeableHours: snapshot.minimumChargeableHours || 1,
            maximumDailyRateMinor: snapshot.maximumDailyRateMinor || null,
            peakMultiplier: snapshot.peakMultiplier || 1.0,
            peakHours: snapshot.peakHours || { startHour: null, endHour: null },
        },
        startedAt,
        releasedAt
    );

    const pickupDeliveryFeeMinor = Money.fromMajor(booking.pricing?.advanceBreakdown?.deliveryFee || 30);
    const returnDeliveryFeeMinor = Money.fromMajor(booking.pricing?.distanceCharge || 0);
    const platformFeeMinor = Money.fromMajor(booking.pricing?.advanceBreakdown?.platformFee || 20);
    const handlingFeeMinor = Money.fromMajor(booking.pricing?.advanceBreakdown?.handlingFee || 0);
    const packingFeeMinor = Money.fromMajor(booking.pricing?.advanceBreakdown?.packingFee || 0);

    // --- Vendor payables & platform commission: sourced from Earning, not recomputed ---
    const earnings = await Earning.find({ bookingId: booking._id }).lean();
    const sumByPurpose = (purpose, field) =>
        earnings.filter((e) => e.purpose === purpose).reduce((s, e) => Money.add(s, e[field] || 0), 0);

    const driver1PayableMinor = sumByPurpose(EARNING_PURPOSE.PICKUP, "netEarningMinor");
    const driver2PayableMinor = sumByPurpose(EARNING_PURPOSE.RETURN_DELIVERY, "netEarningMinor");
    const storePayableMinor = sumByPurpose(EARNING_PURPOSE.STORAGE, "netEarningMinor");

    const pickupCommissionMinor = sumByPurpose(EARNING_PURPOSE.PICKUP, "commissionAmountMinor");
    const deliveryCommissionMinor = sumByPurpose(EARNING_PURPOSE.RETURN_DELIVERY, "commissionAmountMinor");
    const storageMarginMinor = sumByPurpose(EARNING_PURPOSE.STORAGE, "commissionAmountMinor");

    const totalVendorPayablesMinor = Money.add(driver1PayableMinor, Money.add(driver2PayableMinor, storePayableMinor));

    // Calculate Tax Reserve (18% GST) — GST applies to fee components only,
    // never to tips (plan Section 3.1/3.2).
    const taxableSubtotalMinor = Money.add(
        Money.add(platformFeeMinor, handlingFeeMinor),
        Money.add(packingFeeMinor, Money.add(pickupDeliveryFeeMinor, Money.add(storageCalc.customerStorageFeeMinor, returnDeliveryFeeMinor)))
    );

    const cgstMinor = Money.round(taxableSubtotalMinor * 0.09);
    const sgstMinor = Money.round(taxableSubtotalMinor * 0.09);
    const totalTaxMinor = Money.add(cgstMinor, sgstMinor);

    // Bottom-up: platform's own stated revenue components (plan Section 4.2) —
    // platform fee + handling/packing fee + commission earned on each leg.
    const statedRevenueMinor = Money.add(
        Money.add(platformFeeMinor, handlingFeeMinor),
        Money.add(packingFeeMinor, Money.add(pickupCommissionMinor, Money.add(deliveryCommissionMinor, storageMarginMinor)))
    );

    // Top-down: what's left after tax and vendor payables from actual collections.
    const holditNetRevenueMinor = Money.subtract(netCustomerCollectedMinor, Money.add(totalTaxMinor, totalVendorPayablesMinor));

    // The two paths should agree to within rounding. A mismatch means an
    // Earning record and the booking.pricing snapshot have drifted apart —
    // surface it instead of silently averaging/masking it.
    const reconciliationDiscrepancyMinor = Math.abs(Money.subtract(holditNetRevenueMinor, statedRevenueMinor));
    const isReconciled = reconciliationDiscrepancyMinor <= 1; // 1 paise rounding tolerance

    const ledgerData = {
        bookingId: booking._id,
        bookingCode: booking.bookingCode,
        storeId: booking.storeId || null,
        storeOwnerId,
        pickupDriverId: booking.pickup?.assignment?.driverId || null,
        returnDriverId: booking.delivery?.assignment?.driverId || null,

        grossCollectedMinor,
        netCustomerCollectedMinor,
        refundedMinor: totalRefundedMinor,

        taxReserveMinor: {
            cgstMinor,
            sgstMinor,
            igstMinor: 0,
            totalTaxMinor,
        },

        driver1PayableMinor,
        storePayableMinor,
        driver2PayableMinor,

        holditRevenueMinor: {
            platformFeeMinor,
            handlingFeeMinor,
            packingFeeMinor,
            pickupCommissionMinor,
            deliveryCommissionMinor,
            storageMarginMinor,
            totalNetRevenueMinor: holditNetRevenueMinor,
        },

        isReconciled,
        reconciledAt: isReconciled ? new Date() : null,
        reconciliationDiscrepancyMinor: isReconciled ? 0 : reconciliationDiscrepancyMinor,

        // Legacy compatibility major unit fields
        grossCollected: Money.fromMinor(grossCollectedMinor),
        storePayout: {
            storageCharge: Money.fromMinor(storePayableMinor),
            commissionDeducted: Money.fromMinor(storageMarginMinor),
            netPayout: Money.fromMinor(storePayableMinor),
            status: "SETTLED",
        },
        pickupDriverPayout: {
            deliveryFee: Money.fromMinor(pickupDeliveryFeeMinor),
            tipAmount: booking.pickupTipAmount || 0,
            netPayout: Money.fromMinor(driver1PayableMinor),
            status: "SETTLED",
        },
        returnDriverPayout: {
            deliveryFee: Money.fromMinor(returnDeliveryFeeMinor),
            tipAmount: booking.returnTipAmount || 0,
            netPayout: Money.fromMinor(driver2PayableMinor),
            status: "SETTLED",
        },
        holditProfit: {
            platformFee: Money.fromMinor(platformFeeMinor),
            handlingFee: Money.fromMinor(handlingFeeMinor),
            packingFee: Money.fromMinor(packingFeeMinor),
            storeCommission: Money.fromMinor(storageMarginMinor),
            pickupCommission: Money.fromMinor(pickupCommissionMinor),
            deliveryCommission: Money.fromMinor(deliveryCommissionMinor),
            totalNetProfit: Money.fromMinor(holditNetRevenueMinor),
        },
        taxReserve: {
            cgstAmount: Money.fromMinor(cgstMinor),
            sgstAmount: Money.fromMinor(sgstMinor),
            totalTax: Money.fromMinor(totalTaxMinor),
        },
    };

    if (existingLedger) {
        Object.assign(existingLedger, ledgerData);
        await existingLedger.save();
    } else {
        existingLedger = await FinancialLedger.create(ledgerData);
    }

    logger.info(
        `[FundDistribution] Financial Ledger reconciled for booking ${booking.bookingCode}: ` +
            `Customer Net ₹${Money.fromMinor(netCustomerCollectedMinor)}, Store ₹${Money.fromMinor(storePayableMinor)}, ` +
            `Drivers ₹${Money.fromMinor(Money.add(driver1PayableMinor, driver2PayableMinor))}, ` +
            `Holdit Revenue ₹${Money.fromMinor(holditNetRevenueMinor)}` +
            (isReconciled ? "" : ` [DISCREPANCY: ₹${Money.fromMinor(reconciliationDiscrepancyMinor)}]`)
    );

    return existingLedger;
}

export async function getHolditFinancialSummary() {
    const aggregations = await FinancialLedger.aggregate([
        {
            $group: {
                _id: null,
                totalGrossCollectedMinor: { $sum: "$grossCollectedMinor" },
                totalStorePayablesMinor: { $sum: "$storePayableMinor" },
                totalDriver1PayablesMinor: { $sum: "$driver1PayableMinor" },
                totalDriver2PayablesMinor: { $sum: "$driver2PayableMinor" },
                totalHolditRevenueMinor: { $sum: "$holditRevenueMinor.totalNetRevenueMinor" },
                totalPickupCommissionMinor: { $sum: "$holditRevenueMinor.pickupCommissionMinor" },
                totalDeliveryCommissionMinor: { $sum: "$holditRevenueMinor.deliveryCommissionMinor" },
                totalStorageMarginMinor: { $sum: "$holditRevenueMinor.storageMarginMinor" },
                totalTaxCollectedMinor: { $sum: "$taxReserveMinor.totalTaxMinor" },
                totalBookingsProcessed: { $sum: 1 },
            },
        },
    ]);

    const res = aggregations[0] || {
        totalGrossCollectedMinor: 0,
        totalStorePayablesMinor: 0,
        totalDriver1PayablesMinor: 0,
        totalDriver2PayablesMinor: 0,
        totalHolditRevenueMinor: 0,
        totalPickupCommissionMinor: 0,
        totalDeliveryCommissionMinor: 0,
        totalStorageMarginMinor: 0,
        totalTaxCollectedMinor: 0,
        totalBookingsProcessed: 0,
    };

    return {
        totalGrossCollected: Money.fromMinor(res.totalGrossCollectedMinor),
        totalStorePayouts: Money.fromMinor(res.totalStorePayablesMinor),
        totalDriverPayouts: Money.fromMinor(res.totalDriver1PayablesMinor + res.totalDriver2PayablesMinor),
        totalHolditNetProfit: Money.fromMinor(res.totalHolditRevenueMinor),
        totalCommissionEarned: Money.fromMinor(
            res.totalPickupCommissionMinor + res.totalDeliveryCommissionMinor + res.totalStorageMarginMinor
        ),
        totalTaxCollected: Money.fromMinor(res.totalTaxCollectedMinor),
        totalBookingsProcessed: res.totalBookingsProcessed,
    };
}