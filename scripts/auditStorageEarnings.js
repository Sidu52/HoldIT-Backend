import mongoose from "mongoose";
import Earning from "../models/Earning.js";
import Money from "../utils/money.js";
import logger from "../utils/logger.js";

export async function auditStorageEarnings() {
    const earnings = await Earning.find({
        recipientType: "STORE_OWNER",
        purpose: "STORAGE",
        status: { $in: ["ELIGIBLE", "PAYABLE", "PAID"] },
    })
        .populate("bookingId")
        .lean();

    const report = {
        totalAudited: earnings.length,
        discrepanciesCount: 0,
        paidDiscrepanciesCount: 0,
        unpaidDiscrepanciesCount: 0,
        totalNetDeltaMinor: 0,
        totalNetDeltaMajor: 0,
        discrepancyList: [],
    };

    for (const e of earnings) {
        const booking = e.bookingId;
        if (!booking) continue;

        const startedAt = booking.storage?.startedAt || booking.storage?.storedAt;
        const releasedAt = booking.storage?.releasedAt || booking.delivery?.assignment?.completedAt;

        if (!startedAt || !releasedAt) continue;

        const diffMs = Math.max(0, new Date(releasedAt).getTime() - new Date(startedAt).getTime());
        const realBillableHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

        const snapshot = booking.pricing?.pricingSnapshot || {};
        const storeHourlyRateMinor =
            snapshot.storeStorageHourlyRateMinor || Money.fromMajor((booking.pricing?.perHourRate || 20) * 0.7);

        const expectedGrossMinor = storeHourlyRateMinor * realBillableHours;
        const deltaMinor = expectedGrossMinor - e.grossAmountMinor;

        if (deltaMinor !== 0) {
            report.discrepanciesCount++;
            report.totalNetDeltaMinor += deltaMinor;

            const discrepancyItem = {
                earningId: e._id,
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                status: e.status,
                isEstimate: !!e.isEstimate,
                storedGrossMinor: e.grossAmountMinor,
                expectedGrossMinor,
                deltaMinor,
                deltaMajor: Money.fromMinor(deltaMinor),
                startedAt,
                releasedAt,
                realBillableHours,
                storeHourlyRateMinor,
            };

            if (e.status === "PAID") {
                report.paidDiscrepanciesCount++;
            } else {
                report.unpaidDiscrepanciesCount++;
            }

            report.discrepancyList.push(discrepancyItem);
        }
    }

    report.totalNetDeltaMajor = Money.fromMinor(report.totalNetDeltaMinor);
    return report;
}

// Stpcution if invoked directly via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/holdit";
    mongoose
        .connect(MONGO_URI)
        .then(async () => {
            logger.info("Starting Storage Earnings Audit...");
            const res = await auditStorageEarnings();
            console.log("=== STORAGE EARNINGS AUDIT REPORT ===");
            console.log(`Total Audited: ${res.totalAudited}`);
            console.log(`Discrepancies Count: ${res.discrepanciesCount}`);
            console.log(`Paid Discrepancies (Needs manual adjustment): ${res.paidDiscrepanciesCount}`);
            console.log(`Unpaid Discrepancies: ${res.unpaidDiscrepanciesCount}`);
            console.log(`Total Net Delta: ₹${res.totalNetDeltaMajor}`);
            console.log("Discrepancy Details:", JSON.stringify(res.discrepancyList, null, 2));
            await mongoose.disconnect();
        })
        .catch((err) => {
            console.error("Audit error:", err);
            process.exit(1);
        });
}
