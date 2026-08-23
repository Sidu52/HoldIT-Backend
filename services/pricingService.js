import Money from "../utils/money.js";
import { calculateTax, TAX_MODE } from "../utils/tax.js";

const getDistanceKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // KM
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
            Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return +(R * c).toFixed(2);
};

export function isPeakHour(dateObj, peakHours) {
    if (!peakHours || peakHours.startHour === null || peakHours.startHour === undefined || peakHours.endHour === null || peakHours.endHour === undefined) {
        return false;
    }
    const hour = dateObj.getHours();
    const { startHour, endHour } = peakHours;

    if (startHour <= endHour) {
        return hour >= startHour && hour < endHour;
    } else {
        return hour >= startHour || hour < endHour;
    }
}

// PRICING & STORAGE CALCULATION
export class PricingService {
    // Compute Haversine distance between two sets of lat/lng coordinates.
    static calculateDistanceKm(loc1, loc2) {
        if (!loc1?.lat || !loc1?.lng || !loc2?.lat || !loc2?.lng) {
            throw new Error("[PricingService] Invalid coordinates provided for distance calculation");
        }
        return getDistanceKm(loc1.lat, loc1.lng, loc2.lat, loc2.lng);
    }

    /**
     * Build immutable Pricing Snapshot from active PricingRule & location context.
     */
    static buildPricingSnapshot(rule, storeLocation) {
        const fb = rule.feeBreakdown || {};
        return {
            pricingRuleId: rule._id,
            currency: rule.currency || "INR",

            bagPricing: rule.bagPricing || {
                small: { basePrice: 49, hourlyRate: 15 },
                medium: { basePrice: 99, hourlyRate: 25 },
                large: { basePrice: 149, hourlyRate: 40 },
                other: { basePrice: 199, hourlyRate: 50 },
            },

            perKmRateMinor: Money.fromMajor(rule.perKmRate || 0),
            maxAdvanceDistanceKm: rule.maxAdvanceDistanceKm ?? 15,

            platformFeeMinor: Money.fromMajor(fb.platformFee || 0),
            handlingFeeMinor: Money.fromMajor(fb.handlingFee || 0),
            packingFeeMinor: Money.fromMajor(fb.packingFee || 0),

            customerStorageHourlyRateMinor: Money.fromMajor(rule.hourlyStorageRate || 0),
            // Default store storage rate to 70% of customer rate if not explicitly configured on rule
            storeStorageHourlyRateMinor: Money.fromMajor(rule.storeStorageHourlyRate ?? (rule.hourlyStorageRate ? +(rule.hourlyStorageRate * 0.7).toFixed(2) : 0)),

            minimumChargeableHours: rule.minChargeableHours ?? 1,
            maximumDailyRateMinor: rule.maxDailyRate ? Money.fromMajor(rule.maxDailyRate) : null,

            peakMultiplier: rule.peakMultiplier || 1.0,
            peakHours: rule.peakHours || { startHour: null, endHour: null },

            taxMode: rule.taxMode || TAX_MODE.EXCLUSIVE,
            taxRate: rule.taxRate ?? 18,
            cgstRate: rule.cgstRate ?? 9,
            sgstRate: rule.sgstRate ?? 9,
            igstRate: rule.igstRate ?? 0,
        };
    }

    /**
     * Calculate Advance Payment Quote (Pickup Delivery + Bag Items Base + Platform Fees + Handling + Packing + Tax).
     */
    static calculateAdvanceQuote(pricingSnapshot, pickupLocation, storeLocation, luggage = {}) {
        const rawDistance = this.calculateDistanceKm(pickupLocation, storeLocation);
        const distanceKm = Math.max(1.0, rawDistance); // Minimum 1.0 KM chargeable distance
        const maxDist = pricingSnapshot.maxAdvanceDistanceKm ?? 15;

        if (distanceKm > maxDist) {
            throw new Error(`Pickup distance (${distanceKm} km) exceeds maximum allowed advance distance (${maxDist} km).`);
        }

        const cappedDistanceKm = Math.min(distanceKm, maxDist);
        const deliveryFeeMinor = Money.round(cappedDistanceKm * pricingSnapshot.perKmRateMinor);

        const bagPricing = pricingSnapshot.bagPricing || {
            small: { basePrice: 49, hourlyRate: 15 },
            medium: { basePrice: 99, hourlyRate: 25 },
            large: { basePrice: 149, hourlyRate: 40 },
            other: { basePrice: 199, hourlyRate: 50 },
        };

        const bagBreakdownMinor = {
            smallMinor: Money.round((luggage?.small || 0) * Money.fromMajor(bagPricing.small?.basePrice ?? 49)),
            mediumMinor: Money.round((luggage?.medium || 0) * Money.fromMajor(bagPricing.medium?.basePrice ?? 99)),
            largeMinor: Money.round((luggage?.large || 0) * Money.fromMajor(bagPricing.large?.basePrice ?? 149)),
            otherMinor: Money.round((luggage?.other || 0) * Money.fromMajor(bagPricing.other?.basePrice ?? 199)),
        };

        const bagItemsMinor = Money.add(
            Money.add(bagBreakdownMinor.smallMinor, bagBreakdownMinor.mediumMinor),
            Money.add(bagBreakdownMinor.largeMinor, bagBreakdownMinor.otherMinor)
        );

        const hasOversizedItems = (luggage?.large ?? 0) > 0;
        const handlingFeeMinor = hasOversizedItems ? pricingSnapshot.handlingFeeMinor : 0;
        const platformFeeMinor = pricingSnapshot.platformFeeMinor;
        const packingFeeMinor = pricingSnapshot.packingFeeMinor;

        const subtotalMinor = Money.add(
            Money.add(platformFeeMinor, deliveryFeeMinor),
            Money.add(handlingFeeMinor, Money.add(packingFeeMinor, bagItemsMinor))
        );

        const taxResult = calculateTax(subtotalMinor, {
            taxMode: pricingSnapshot.taxMode,
            taxRate: pricingSnapshot.taxRate,
            cgstRate: pricingSnapshot.cgstRate,
            sgstRate: pricingSnapshot.sgstRate,
            igstRate: pricingSnapshot.igstRate,
        });

        return {
            distanceKm: cappedDistanceKm,
            breakdownMinor: {
                platformFeeMinor,
                deliveryFeeMinor,
                handlingFeeMinor,
                packingFeeMinor,
                bagItemsMinor,
                bagBreakdownMinor,
            },
            subtotalMinor: taxResult.subtotalMinor,
            taxableAmountMinor: taxResult.taxableAmountMinor,
            taxAmountMinor: taxResult.taxAmountMinor,
            cgstAmountMinor: taxResult.cgstAmountMinor,
            sgstAmountMinor: taxResult.sgstAmountMinor,
            igstAmountMinor: taxResult.igstAmountMinor,
            totalAmountMinor: taxResult.totalAmountMinor,
        };
    }

    /**
     * Compute itemized store earning breakdown for given billable hours.
     */
    static calculateStorageEarningAmounts(pricingSnapshot, billableStorageHours) {
        const storeHourlyRateMinor = pricingSnapshot.storeStorageHourlyRateMinor || 0;
        const grossAmountMinor = Money.round(storeHourlyRateMinor * billableStorageHours);
        const commissionAmountMinor = 0;
        const taxDeductionMinor = 0;
        const netEarningMinor = Money.subtract(grossAmountMinor, Money.add(commissionAmountMinor, taxDeductionMinor));

        return {
            grossAmountMinor,
            commissionAmountMinor,
            taxDeductionMinor,
            netEarningMinor,
        };
    }

    /**
     * Authoritative Storage Duration & Charge Calculation.
     * Computes billable hours, customer storage fee, store storage earning, and platform storage margin.
     */
    static calculateStorageCharge(pricingSnapshot, startedAt, releasedAt = new Date(), luggage = {}) {
        const start = new Date(startedAt).getTime();
        const end = new Date(releasedAt).getTime();

        if (isNaN(start)) {
            throw new Error("[PricingService] Invalid startedAt timestamp provided");
        }

        const diffMs = Math.max(0, end - start);
        const rawHours = Math.ceil(diffMs / 3600000);
        const minHours = pricingSnapshot.minimumChargeableHours ?? 1;
        const billableHours = Math.max(rawHours, minHours);

        // Determine Hourly Storage Rate based on bag sizes if available
        const bagPricing = pricingSnapshot.bagPricing;
        let calculatedHourlyRateMinor = pricingSnapshot.customerStorageHourlyRateMinor;
        if (bagPricing && luggage && (luggage.small || luggage.medium || luggage.large || luggage.other)) {
            const hourlyTotalMajor = 
                (luggage.small || 0) * (bagPricing.small?.hourlyRate ?? 15) +
                (luggage.medium || 0) * (bagPricing.medium?.hourlyRate ?? 25) +
                (luggage.large || 0) * (bagPricing.large?.hourlyRate ?? 40) +
                (luggage.other || 0) * (bagPricing.other?.hourlyRate ?? 50);
            if (hourlyTotalMajor > 0) {
                calculatedHourlyRateMinor = Money.fromMajor(hourlyTotalMajor);
            }
        }

        // Customer Storage Base Charge
        let customerBaseMinor = billableHours * calculatedHourlyRateMinor;
        if (pricingSnapshot.maximumDailyRateMinor && pricingSnapshot.maximumDailyRateMinor > 0) {
            const totalDays = Math.ceil(billableHours / 24);
            const cappedMinor = totalDays * pricingSnapshot.maximumDailyRateMinor;
            customerBaseMinor = Math.min(customerBaseMinor, cappedMinor);
        }

        const multiplier = isPeakHour(new Date(releasedAt), pricingSnapshot.peakHours)
            ? pricingSnapshot.peakMultiplier || 1.0
            : 1.0;

        const customerStorageFeeMinor = Money.round(customerBaseMinor * multiplier);

        // Store Storage Earning
        const earningAmounts = this.calculateStorageEarningAmounts(pricingSnapshot, billableHours);
        const storeEarningMinor = earningAmounts.netEarningMinor;

        // Holdit Storage Margin
        const platformStorageMarginMinor = Math.max(0, Money.subtract(customerStorageFeeMinor, storeEarningMinor));

        return {
            billableHours,
            customerStorageFeeMinor,
            storeEarningMinor,
            grossAmountMinor: earningAmounts.grossAmountMinor,
            commissionAmountMinor: earningAmounts.commissionAmountMinor,
            taxDeductionMinor: earningAmounts.taxDeductionMinor,
            netEarningMinor: earningAmounts.netEarningMinor,
            platformStorageMarginMinor,
        };
    }

    /**
     * Calculate Return Payment Quote (Storage Fee + Return Delivery Fee + Tax).
     */
    static calculateReturnQuote(pricingSnapshot, storeLocation, deliveryLocation, startedAt, releasedAt = new Date()) {
        const { billableHours, customerStorageFeeMinor, storeEarningMinor, platformStorageMarginMinor } =
            this.calculateStorageCharge(pricingSnapshot, startedAt, releasedAt);

        const returnDistanceKm = this.calculateDistanceKm(storeLocation, deliveryLocation);
        const returnDeliveryFeeMinor = Money.round(returnDistanceKm * pricingSnapshot.perKmRateMinor);

        const subtotalMinor = Money.add(customerStorageFeeMinor, returnDeliveryFeeMinor);

        const taxResult = calculateTax(subtotalMinor, {
            taxMode: pricingSnapshot.taxMode,
            taxRate: pricingSnapshot.taxRate,
            cgstRate: pricingSnapshot.cgstRate,
            sgstRate: pricingSnapshot.sgstRate,
            igstRate: pricingSnapshot.igstRate,
        });

        return {
            billableHours,
            returnDistanceKm,
            customerStorageFeeMinor,
            storeEarningMinor,
            platformStorageMarginMinor,
            returnDeliveryFeeMinor,
            subtotalMinor: taxResult.subtotalMinor,
            taxableAmountMinor: taxResult.taxableAmountMinor,
            taxAmountMinor: taxResult.taxAmountMinor,
            cgstAmountMinor: taxResult.cgstAmountMinor,
            sgstAmountMinor: taxResult.sgstAmountMinor,
            igstAmountMinor: taxResult.igstAmountMinor,
            totalAmountMinor: taxResult.totalAmountMinor,
        };
    }
}

export default PricingService;
