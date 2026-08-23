const getDistanceKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // km
    const dLat = deg2rad(lat2 - lat1);
    const dLng = deg2rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
};

const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
};

export function calculateAdvanceAmount(rule, pickupLocation, storeLocation, luggage) {
    // Fail loudly on incomplete pricing config — a NaN advance amount
    // must never reach Razorpay's orders.create call.
    const fb = rule.feeBreakdown;
    if (
        !fb ||
        typeof fb.platformFee !== "number" ||
        typeof fb.packingFee !== "number" ||
        typeof fb.handlingFee !== "number" ||
        typeof rule.perKmRate !== "number"
    ) {
        throw new Error(
            `[calculateAdvanceAmount] Incomplete PricingRule '${rule._id}' — feeBreakdown or perKmRate missing/invalid.`
        );
    }

    const distanceKm = getDistanceKm(
        pickupLocation.lat, pickupLocation.lng,
        storeLocation.lat, storeLocation.lng
    );

    // Pickup distance validation against maxAdvanceDistanceKm
    if (rule.maxAdvanceDistanceKm && distanceKm > rule.maxAdvanceDistanceKm) {
        throw new Error(
            `Pickup distance (${distanceKm.toFixed(1)} km) exceeds maximum allowed advance distance (${rule.maxAdvanceDistanceKm} km).`
        );
    }

    const cappedDistanceKm = Math.min(distanceKm, rule.maxAdvanceDistanceKm ?? 15);
    const deliveryFee = +(cappedDistanceKm * rule.perKmRate).toFixed(2);

    const hasOversizedItems = (luggage?.large ?? 0) > 0;
    const handlingFee = hasOversizedItems ? fb.handlingFee : 0;

    const breakdown = {
        platformFee: fb.platformFee,
        deliveryFee,
        handlingFee,
        packingFee: fb.packingFee,
    };

    const advanceAmount = +Object.values(breakdown).reduce((sum, v) => sum + v, 0).toFixed(2);

    if (!Number.isFinite(advanceAmount) || advanceAmount <= 0) {
        throw new Error(
            `[calculateAdvanceAmount] Computed invalid advanceAmount (${advanceAmount}) for rule '${rule._id}'.`
        );
    }

    return { advanceAmount, breakdown, distanceKm: cappedDistanceKm };
}

export const calculateDeliveryDistanceCharge = (perKmRate, storeLocation, deliveryLocation) => {
    if (!storeLocation?.lat || !storeLocation?.lng || !deliveryLocation?.lat || !deliveryLocation?.lng) {
        throw new Error("Invalid locations provided for distance calculation.");
    }
    const distanceKm = getDistanceKm(deliveryLocation.lat, deliveryLocation.lng, storeLocation.lat, storeLocation.lng);
    return +(distanceKm * perKmRate).toFixed(2);
};

/**
 * Evaluates whether a given timestamp falls within peak hours defined on PricingRule.
 * Correctly handles overnight time ranges (e.g. startHour: 22, endHour: 6).
 */
export function isPeakHour(dateObj, peakHours) {
    if (!peakHours || peakHours.startHour === null || peakHours.endHour === null) {
        return false;
    }
    const hour = dateObj.getHours();
    const { startHour, endHour } = peakHours;

    if (startHour <= endHour) {
        // Normal range, e.g. 9 AM to 5 PM (9 to 17)
        return hour >= startHour && hour < endHour;
    } else {
        // Overnight range, e.g. 10 PM to 6 AM (22 to 6)
        return hour >= startHour || hour < endHour;
    }
}

/**
 * Calculates storage charge applying minChargeableHours, maxDailyRate cap, and peakMultiplier.
 */
export function calculateStorageFee(rule, storedAt, endAt = new Date()) {
    const start = new Date(storedAt).getTime();
    const end = new Date(endAt).getTime();
    const diffMs = Math.max(0, end - start);
    const rawHours = Math.ceil(diffMs / 3600000);
    const minHours = rule.minChargeableHours ?? 1;
    const storageHours = Math.max(rawHours, minHours);

    let baseCharge = storageHours * rule.hourlyStorageRate;

    // Apply maxDailyRate cap per day if specified
    if (rule.maxDailyRate && rule.maxDailyRate > 0) {
        const totalDays = Math.ceil(storageHours / 24);
        const cappedCharge = totalDays * rule.maxDailyRate;
        baseCharge = Math.min(baseCharge, cappedCharge);
    }

    // Apply peak multiplier if timestamp falls in peak hours
    const multiplier = isPeakHour(new Date(endAt), rule.peakHours) ? (rule.peakMultiplier || 1.0) : 1.0;
    const finalStorageFee = +(baseCharge * multiplier).toFixed(2);

    return { storageHours, storageFee: finalStorageFee };
}