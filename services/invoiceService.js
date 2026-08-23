import Booking from "../models/Booking.js";
import Payment, { PAYMENT_STATUS, PAYMENT_TYPE } from "../models/Payment.js";
import Invoice, { INVOICE_TYPE } from "../models/Invoice.js";
import Earning, { EARNING_RECIPIENT, EARNING_PURPOSE } from "../models/Earning.js";
import PaymentDistribution from "../models/PaymentDistribution.js";
import Money from "../utils/money.js";
import Payout from "../models/Payout.js";

export const DOCUMENT_TYPES = Object.freeze({
    CUSTOMER_INVOICE: "CUSTOMER_INVOICE",
    STORE_BOOKING_INVOICE: "STORE_BOOKING_INVOICE",
    STORE_OWNER_SETTLEMENT: "STORE_OWNER_SETTLEMENT",
    DRIVER_PICKUP_SETTLEMENT: "DRIVER_PICKUP_SETTLEMENT",
    DRIVER_RETURN_SETTLEMENT: "DRIVER_RETURN_SETTLEMENT",
});

//USER / CUSTOMER INVOICE
export async function getCustomerInvoiceData(bookingId) {
    const booking = await Booking.findById(bookingId)
        .populate("userId", "first_name last_name phone email")
        .populate("storeId", "store_name store_contact_number location gstin address")
        .lean();

    if (!booking) {
        throw new Error(`[getCustomerInvoiceData] Booking ${bookingId} not found`);
    }

    // Fetch persisted invoices from MongoDB
    const invoices = await Invoice.find({ bookingId: booking._id }).sort({ createdAt: 1 }).lean();

    const [advancePayment, finalPayment] = await Promise.all([
        Payment.findOne({ bookingId: booking._id, type: PAYMENT_TYPE.ADVANCE, status: PAYMENT_STATUS.CAPTURED }).lean(),
        Payment.findOne({ bookingId: booking._id, type: PAYMENT_TYPE.FINAL, status: PAYMENT_STATUS.CAPTURED }).lean(),
    ]);

    const advanceAmount = advancePayment 
        ? (advancePayment.amountMinor ? Money.fromMinor(advancePayment.amountMinor) : advancePayment.amount / 100) 
        : 0;
    const finalAmount = finalPayment 
        ? (finalPayment.amountMinor ? Money.fromMinor(finalPayment.amountMinor) : finalPayment.amount / 100) 
        : 0;

    let subtotal = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let totalBookingAmount = 0;
    let stableInvoiceNumber = `INV-${(booking.bookingCode || booking._id.toString()).slice(-8).toUpperCase()}`;

    const itemizedServices = [];

    if (invoices.length > 0) {
        // Use the latest persistent invoice as the source of truth
        const latestInvoice = invoices[invoices.length - 1];
        stableInvoiceNumber = latestInvoice.invoiceNumber;
        subtotal = latestInvoice.subtotalMinor ? Money.fromMinor(latestInvoice.subtotalMinor) : (latestInvoice.subtotal || 0);
        cgstAmount = latestInvoice.cgstAmountMinor ? Money.fromMinor(latestInvoice.cgstAmountMinor) : (latestInvoice.cgstAmount || 0);
        sgstAmount = latestInvoice.sgstAmountMinor ? Money.fromMinor(latestInvoice.sgstAmountMinor) : (latestInvoice.sgstAmount || 0);
        totalBookingAmount = latestInvoice.totalAmountMinor ? Money.fromMinor(latestInvoice.totalAmountMinor) : (latestInvoice.totalAmount || 0);

        for (const inv of invoices) {
            for (const li of inv.lineItems || []) {
                itemizedServices.push({
                    description: li.description,
                    amount: li.amountMinor ? Money.fromMinor(li.amountMinor) : li.amount,
                });
            }
        }
    } else {
        // Fallback mapper for legacy bookings without persistent invoice
        const storageFee = booking.pricing?.perHourRate 
            ? (booking.pricing.storageHours || 1) * booking.pricing.perHourRate 
            : 60;
        const pickupDeliveryFee = booking.pricing?.advanceBreakdown?.deliveryFee || 30;
        const returnDeliveryFee = booking.pricing?.distanceCharge || 0;

        itemizedServices.push(
            { description: "Luggage Storage Vault Fee", amount: storageFee },
            { description: "Pickup Transfer Fee", amount: pickupDeliveryFee },
            { description: "Return Delivery Fee", amount: returnDeliveryFee }
        );

        subtotal = +(storageFee + pickupDeliveryFee + returnDeliveryFee).toFixed(2);
        cgstAmount = +(subtotal * 0.09).toFixed(2);
        sgstAmount = +(subtotal * 0.09).toFixed(2);
        totalBookingAmount = +(subtotal + cgstAmount + sgstAmount).toFixed(2);
    }

    const totalPaid = +(advanceAmount + finalAmount).toFixed(2);
    const balanceAmount = Math.max(0, +(totalBookingAmount - totalPaid).toFixed(2));
    const paymentStatus = balanceAmount <= 0 ? "PAID IN FULL" : (advancePayment ? "ADVANCE PAID" : "PENDING");

    return {
        documentType: DOCUMENT_TYPES.CUSTOMER_INVOICE,
        invoiceNumber: stableInvoiceNumber,
        bookingCode: booking.bookingCode,
        bookingId: booking._id,
        createdAt: booking.createdAt,
        customer: {
            name: `${booking.userInfo?.firstName || booking.userId?.first_name || "Customer"} ${booking.userInfo?.lastName || booking.userId?.last_name || ""}`.trim(),
            phone: booking.userInfo?.phone || booking.userId?.phone || "N/A",
        },
        store: {
            name: booking.storeId?.store_name || "Luggage Vault Outlet",
            address: booking.pickupLocation?.address || booking.deliveryLocation?.address || "Store Facility",
            gstin: booking.storeId?.gstin || "27AAAAA0000A1Z5",
        },
        storage: {
            expectedDurationHours: booking.storage?.expectedDurationHours || 24,
            storedAt: booking.storage?.startedAt || booking.storage?.storedAt,
            releasedAt: booking.storage?.releasedAt,
        },
        luggage: booking.luggage || { totalCount: 1 },
        itemizedServices,
        subtotal,
        cgstAmount,
        sgstAmount,
        totalBookingAmount,
        paymentSummary: {
            advancePayment: { amount: advanceAmount, status: advancePayment ? "CAPTURED" : "PENDING" },
            finalPayment: { amount: finalAmount, status: finalPayment ? "CAPTURED" : "PENDING" },
            totalPaid,
            balanceAmount,
            paymentStatus,
        },
    };
}

// STORE OWNER SETTLEMENT STATEMENT/
export async function getStoreOwnerSettlementData(bookingId, storeOwnerId = null) {
    const booking = await Booking.findById(bookingId)
        .populate("userId", "first_name last_name phone")
        .populate("storeId", "store_name store_owner_id gstin")
        .lean();

    if (!booking) throw new Error("Booking not found");

    if (storeOwnerId && booking.storeId?.store_owner_id?.toString() !== storeOwnerId.toString()) {
        throw new Error("Unauthorized store owner access");
    }

    const earning = await Earning.findOne({
        bookingId: booking._id,
        recipientType: EARNING_RECIPIENT.STORE_OWNER,
        purpose: EARNING_PURPOSE.STORAGE,
    }).lean();

    const snapshot = booking.pricing?.pricingSnapshot || {};
    const storeHourlyRateMinor = snapshot.storeStorageHourlyRateMinor || Money.fromMajor((booking.pricing?.perHourRate || 20) * 0.7);
    const storeHourlyRate = Money.fromMinor(storeHourlyRateMinor);

    const startedAt = booking.storage?.startedAt || booking.storage?.storedAt || null;
    const releasedAt = booking.storage?.releasedAt || null;

    let billableStorageHours = booking.pricing?.storageHours || booking.storage?.expectedDurationHours || 1;
    if (startedAt && releasedAt) {
        const diffMs = new Date(releasedAt).getTime() - new Date(startedAt).getTime();
        billableStorageHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
    }

    let grossAmountMinor = storeHourlyRateMinor * billableStorageHours;
    let commissionAmountMinor = 0;
    let taxDeductionMinor = 0;
    let netEarningMinor = grossAmountMinor;
    let status = "PENDING";

    if (earning) {
        if (earning.isEstimate && startedAt && releasedAt) {
            grossAmountMinor = storeHourlyRateMinor * billableStorageHours;
            commissionAmountMinor = earning.commissionAmountMinor || 0;
            taxDeductionMinor = earning.taxDeductionMinor || 0;
            netEarningMinor = Money.subtract(grossAmountMinor, Money.add(commissionAmountMinor, taxDeductionMinor));
        } else {
            grossAmountMinor = earning.grossAmountMinor;
            commissionAmountMinor = earning.commissionAmountMinor || 0;
            taxDeductionMinor = earning.taxDeductionMinor || 0;
            netEarningMinor = earning.netEarningMinor;
        }
        status = earning.status;
    } else {
        const dist = await PaymentDistribution.findOne({
            bookingId: booking._id,
            recipientType: "STORE_OWNER",
            purpose: "STORAGE",
        }).lean();
        if (dist) {
            grossAmountMinor = Money.fromMajor(dist.amount || 60);
            netEarningMinor = grossAmountMinor;
            status = dist.status === "DISBURSED" ? "PAID" : (dist.status === "SETTLED" ? "PAYABLE" : "PENDING");
        }
    }

    let payoutDoc = null;
    if (earning?.payoutId || status === "PAID") {
        payoutDoc = await Payout.findOne({
            $or: [
                { _id: earning?.payoutId },
                { earningId: earning?._id },
                { bookingId: booking._id, recipientType: "STORE_OWNER" }
            ]
        }).lean();
    }

    let statementClassification = "IN_PROGRESS";
    let isDownloadable = false;

    if (status === "PENDING") {
        statementClassification = "IN_PROGRESS";
        isDownloadable = false;
    } else if (status === "ELIGIBLE" || status === "PAYABLE") {
        statementClassification = "PROVISIONAL";
        isDownloadable = true;
    } else if (status === "PAID") {
        statementClassification = "SETTLED";
        isDownloadable = true;
    }

    return {
        documentType: DOCUMENT_TYPES.STORE_OWNER_SETTLEMENT,
        settlementId: `STLM-${(booking.bookingCode || booking._id.toString()).slice(-8).toUpperCase()}`,
        bookingCode: booking.bookingCode,
        bookingId: booking._id,
        store: {
            id: booking.storeId?._id || booking.storeId,
            name: booking.storeId?.store_name || "Vault Store",
            gstin: booking.storeId?.gstin || "",
        },
        storagePeriod: {
            startedAt,
            releasedAt,
            expectedDurationHours: booking.storage?.expectedDurationHours || 24,
            billableHours: billableStorageHours,
        },
        rates: {
            storeStorageHourlyRateMinor: storeHourlyRateMinor,
            storeStorageHourlyRate: storeHourlyRate,
        },
        financials: {
            grossStoreAmount: Money.fromMinor(grossAmountMinor),
            grossEarningMinor: grossAmountMinor,
            commissionDeduction: Money.fromMinor(commissionAmountMinor),
            commissionAmountMinor,
            taxDeduction: Money.fromMinor(taxDeductionMinor),
            taxDeductionMinor,
            netStorePayout: Money.fromMinor(netEarningMinor),
            netEarningMinor,
        },
        payoutStatus: status,
        earningStatus: status,
        statementClassification,
        isDownloadable,
        settlementDate: earning?.paidAt || payoutDoc?.completedAt || earning?.createdAt || new Date(),
        payoutReference: payoutDoc?.providerTransferId || (payoutDoc ? `TRF-${payoutDoc._id.toString().slice(-8)}` : (status === "PAID" ? `REF-${booking._id.toString().slice(-6)}` : null)),
        payout: status === "PAID" ? {
            payoutId: payoutDoc?._id || null,
            providerTransferId: payoutDoc?.providerTransferId || `TRF-${(earning?._id || booking._id).toString().slice(-8)}`,
            completedAt: payoutDoc?.completedAt || payoutDoc?.updatedAt || earning?.paidAt || new Date(),
        } : null,
    };
}

export async function getStorePeriodicSettlements(storeOwnerId = null, storeId = null) {
    const earningFilter = {
        recipientType: EARNING_RECIPIENT.STORE_OWNER,
        status: { $in: ["PAID", "PAYABLE", "ELIGIBLE"] },
    };
    if (storeOwnerId) earningFilter.recipientId = storeOwnerId;
    if (storeId) earningFilter.storeId = storeId;

    const earnings = await Earning.find(earningFilter)
        .populate("bookingId", "bookingCode storage pricing createdAt")
        .sort({ paidAt: -1, createdAt: -1 })
        .lean();

    const grouped = {};
    for (const e of earnings) {
        const dateObj = e.paidAt || e.updatedAt || e.createdAt;
        const periodKey = dateObj ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}` : "2026-08";
        if (!grouped[periodKey]) {
            const dateForLabel = new Date(periodKey + "-01");
            const monthName = dateForLabel.toLocaleString("en-US", { month: "long" });
            const yearNum = dateForLabel.getFullYear();
            grouped[periodKey] = {
                periodId: periodKey,
                periodLabel: `${monthName} ${yearNum} Payout Statement`,
                earnings: [],
                totalGrossMinor: 0,
                totalCommissionMinor: 0,
                totalNetPayoutMinor: 0,
                status: "SETTLED",
            };
        }
        grouped[periodKey].earnings.push(e);
        grouped[periodKey].totalGrossMinor = Money.add(grouped[periodKey].totalGrossMinor, e.grossAmountMinor || 0);
        grouped[periodKey].totalCommissionMinor = Money.add(grouped[periodKey].totalCommissionMinor, e.commissionAmountMinor || 0);
        grouped[periodKey].totalNetPayoutMinor = Money.add(grouped[periodKey].totalNetPayoutMinor, e.netEarningMinor || 0);
    }

    const periods = Object.values(grouped).map(p => ({
        periodId: p.periodId,
        periodLabel: p.periodLabel,
        totalGross: Money.fromMinor(p.totalGrossMinor),
        totalCommission: Money.fromMinor(p.totalCommissionMinor),
        totalNetPayout: Money.fromMinor(p.totalNetPayoutMinor),
        totalNetPayoutMinor: p.totalNetPayoutMinor,
        earningsCount: p.earnings.length,
        status: p.status,
        earnings: p.earnings.map(e => ({
            earningId: e._id,
            bookingId: e.bookingId?._id || e.bookingId,
            bookingCode: e.bookingId?.bookingCode || "N/A",
            startedAt: e.bookingId?.storage?.startedAt || e.bookingId?.storage?.storedAt || e.createdAt,
            releasedAt: e.bookingId?.storage?.releasedAt,
            grossEarning: Money.fromMinor(e.grossAmountMinor || 0),
            netEarning: Money.fromMinor(e.netEarningMinor || 0),
            netEarningMinor: e.netEarningMinor || 0,
            status: e.status,
            paidAt: e.paidAt || e.updatedAt || e.createdAt,
        })),
    }));

    return periods;
}

// DRIVER 1 PICKUP SETTLEMENT STATEMENT
export async function getDriverPickupSettlementData(bookingId, driverId) {
    const booking = await Booking.findById(bookingId)
        .populate("userId", "first_name last_name phone email")
        .populate("storeId", "store_name store_contact_number location address")
        .populate("pickup.assignment.driverId", "first_name last_name phone vehicle_number vehicle_type")
        .lean();
    if (!booking) throw new Error("Booking not found");

    const pickupDriver = booking.pickup?.assignment?.driverId;
    const pickupDriverId = pickupDriver?._id || pickupDriver;
    if (driverId && pickupDriverId?.toString() !== driverId.toString()) {
        throw new Error("Unauthorized pickup driver access");
    }

    const earning = await Earning.findOne({
        bookingId: booking._id,
        recipientType: EARNING_RECIPIENT.DRIVER,
        purpose: EARNING_PURPOSE.PICKUP,
    }).lean();

    let pickupFee = 0;
    let status = "PENDING";

    if (earning) {
        pickupFee = Money.fromMinor(earning.netEarningMinor);
        status = earning.status;
    } else {
        const dist = await PaymentDistribution.findOne({
            bookingId: booking._id,
            recipientType: "DRIVER",
            purpose: "PICKUP",
        }).lean();
        pickupFee = dist?.amount || (booking.pricing?.advanceBreakdown?.deliveryFee || 30);
        status = dist?.status || "PENDING";
    }

    const driverName = pickupDriver ? `${pickupDriver.first_name || ""} ${pickupDriver.last_name || ""}`.trim() : "Driver";
    const customerName = `${booking.userInfo?.firstName || booking.userId?.first_name || "Customer"} ${booking.userInfo?.lastName || booking.userId?.last_name || ""}`.trim();
    const customerPhone = booking.userInfo?.phone || booking.userId?.phone || "N/A";
    const storeName = booking.storeId?.store_name || "Storage Partner Store";

    const completedAt = booking.pickup?.assignment?.completedAt || booking.updatedAt || booking.createdAt;

    return {
        documentType: DOCUMENT_TYPES.DRIVER_PICKUP_SETTLEMENT,
        settlementId: `DSP-${(booking.bookingCode || booking._id.toString()).slice(-8).toUpperCase()}-PICKUP`,
        rideId: `${booking._id}:pickup`,
        bookingId: booking._id,
        bookingCode: booking.bookingCode || booking._id.toString().slice(-8).toUpperCase(),
        rideType: "PICKUP",
        direction: "USER → STORAGE",
        tripType: "USER → STORAGE",
        tripRole: "Pickup Transfer",
        serviceDescription: "Initial Luggage Pickup & Storage Transfer",
        date: completedAt,
        driver: {
            id: pickupDriverId,
            name: driverName || "Driver",
            phone: pickupDriver?.phone || "N/A",
            vehicleNumber: pickupDriver?.vehicle_number || "N/A",
            vehicleType: pickupDriver?.vehicle_type || "Two Wheeler",
        },
        customer: {
            name: customerName,
            phone: customerPhone,
        },
        store: {
            name: storeName,
            address: booking.storeId?.location?.address || booking.storageLocation?.address || "Store Vault Location",
        },
        pickupLocation: booking.pickupLocation?.address || "User Location",
        dropLocation: booking.storageLocation?.address || booking.storeId?.location?.address || "Store Vault Location",
        distanceKm: Number(booking.distance || 0).toFixed(1),
        luggageCount: (booking.luggage?.small || 0) + (booking.luggage?.medium || 0) + (booking.luggage?.large || 0) + (booking.luggage?.other || 0) || 1,
        earnings: {
            baseFee: pickupFee,
            distanceCharge: 0,
            incentive: 0,
            grossEarnings: pickupFee,
            netEarnings: pickupFee,
        },
        paymentStatus: status,
        payoutReference: earning?._id ? `PAY-${earning._id.toString().slice(-8).toUpperCase()}` : `REF-P-${booking._id.toString().slice(-6).toUpperCase()}`,
        paidAt: earning?.paidAt || (status === "PAID" ? completedAt : null),
    };
}

// DRIVER 2 RETURN DELIVERY SETTLEMENT STATEMENT
export async function getDriverReturnSettlementData(bookingId, driverId) {
    const booking = await Booking.findById(bookingId)
        .populate("userId", "first_name last_name phone email")
        .populate("storeId", "store_name store_contact_number location address")
        .populate("delivery.assignment.driverId", "first_name last_name phone vehicle_number vehicle_type")
        .lean();
    if (!booking) throw new Error("Booking not found");

    const returnDriver = booking.delivery?.assignment?.driverId;
    const returnDriverId = returnDriver?._id || returnDriver;
    if (driverId && returnDriverId?.toString() !== driverId.toString()) {
        throw new Error("Unauthorized return driver access");
    }

    const earning = await Earning.findOne({
        bookingId: booking._id,
        recipientType: EARNING_RECIPIENT.DRIVER,
        purpose: EARNING_PURPOSE.RETURN_DELIVERY,
    }).lean();

    let returnFee = 0;
    let status = "PENDING";

    if (earning) {
        returnFee = Money.fromMinor(earning.netEarningMinor);
        status = earning.status;
    } else {
        const dist = await PaymentDistribution.findOne({
            bookingId: booking._id,
            recipientType: "DRIVER",
            purpose: "RETURN_DELIVERY",
        }).lean();
        returnFee = dist?.amount || (booking.pricing?.distanceCharge || 30);
        status = dist?.status || "PENDING";
    }

    const driverName = returnDriver ? `${returnDriver.first_name || ""} ${returnDriver.last_name || ""}`.trim() : "Driver";
    const customerName = `${booking.userInfo?.firstName || booking.userId?.first_name || "Customer"} ${booking.userInfo?.lastName || booking.userId?.last_name || ""}`.trim();
    const customerPhone = booking.userInfo?.phone || booking.userId?.phone || "N/A";
    const storeName = booking.storeId?.store_name || "Storage Partner Store";

    const completedAt = booking.delivery?.assignment?.completedAt || booking.updatedAt || booking.createdAt;

    return {
        documentType: DOCUMENT_TYPES.DRIVER_RETURN_SETTLEMENT,
        settlementId: `DSP-${(booking.bookingCode || booking._id.toString()).slice(-8).toUpperCase()}-RETURN`,
        rideId: `${booking._id}:return`,
        bookingId: booking._id,
        bookingCode: booking.bookingCode || booking._id.toString().slice(-8).toUpperCase(),
        rideType: "RETURN",
        direction: "STORAGE → USER",
        tripType: "STORAGE → USER",
        tripRole: "Return Delivery",
        serviceDescription: "Luggage Return to Customer Location",
        date: completedAt,
        driver: {
            id: returnDriverId,
            name: driverName || "Driver",
            phone: returnDriver?.phone || "N/A",
            vehicleNumber: returnDriver?.vehicle_number || "N/A",
            vehicleType: returnDriver?.vehicle_type || "Two Wheeler",
        },
        customer: {
            name: customerName,
            phone: customerPhone,
        },
        store: {
            name: storeName,
            address: booking.storeId?.location?.address || booking.storageLocation?.address || "Store Vault Location",
        },
        pickupLocation: booking.storageLocation?.address || booking.storeId?.location?.address || "Store Vault Location",
        dropLocation: booking.deliveryLocation?.address || "User Delivery Location",
        distanceKm: Number(booking.distance || 0).toFixed(1),
        luggageCount: (booking.luggage?.small || 0) + (booking.luggage?.medium || 0) + (booking.luggage?.large || 0) + (booking.luggage?.other || 0) || 1,
        earnings: {
            baseFee: returnFee,
            distanceCharge: 0,
            incentive: 0,
            grossEarnings: returnFee,
            netEarnings: returnFee,
        },
        paymentStatus: status,
        payoutReference: earning?._id ? `PAY-${earning._id.toString().slice(-8).toUpperCase()}` : `REF-R-${booking._id.toString().slice(-6).toUpperCase()}`,
        paidAt: earning?.paidAt || (status === "PAID" ? completedAt : null),
    };
}

export function generateDriverStatementHTML(settlement) {
    const formattedDate = new Date(settlement.date || Date.now()).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const isPaid = settlement.paymentStatus === "PAID" || settlement.paymentStatus === "SETTLED";
    const statusBg = isPaid ? "#D1FAE5" : "#FEF3C7";
    const statusColor = isPaid ? "#065F46" : "#92400E";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Driver Payment Statement - ${settlement.settlementId}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: #f8fafc; color: #1e293b; padding: 24px 16px; display: flex; justify-content: center; }
        .receipt-card { background: #ffffff; width: 100%; max-width: 600px; border-radius: 16px; border: 1px solid #e2e8f0; padding: 28px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px dashed #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
        .brand-title { font-size: 24px; font-weight: 800; color: #1D3C44; }
        .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .badge { background: ${statusBg}; color: ${statusColor}; font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
        .section-title { font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; background: #f8fafc; padding: 14px; border-radius: 12px; }
        .info-item label { font-size: 11px; color: #64748b; display: block; margin-bottom: 2px; }
        .info-item span { font-size: 13px; font-weight: 700; color: #0f172a; }
        .route-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 20px; }
        .route-point { margin-bottom: 10px; display: flex; gap: 10px; }
        .route-point:last-child { margin-bottom: 0; }
        .point-dot { width: 10px; height: 10px; border-radius: 5px; background: #10B981; margin-top: 4px; }
        .point-dot.drop { background: #1D3C44; border-radius: 2px; }
        .point-info label { font-size: 10px; font-weight: 700; color: #64748b; }
        .point-info p { font-size: 13px; font-weight: 600; color: #1e293b; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .table th { text-align: left; font-size: 11px; color: #64748b; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .table td { padding: 12px 0; font-size: 13px; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
        .table td.amount { text-align: right; font-weight: 700; }
        .total-row { display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
        .total-label { font-size: 14px; font-weight: 800; color: #065F46; }
        .total-amount { font-size: 26px; font-weight: 800; color: #065F46; }
        .footer { text-align: center; border-top: 1px solid #e2e8f0; padding-top: 18px; }
        .footer p { font-size: 11px; color: #94a3b8; margin-bottom: 14px; }
        .btn-print { background: #1D3C44; color: white; border: none; padding: 10px 24px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; }
        @media print { .btn-print { display: none; } body { background: white; padding: 0; } .receipt-card { border: none; box-shadow: none; max-width: 100%; } }
    </style>
</head>
<body>
    <div class="receipt-card">
        <div class="header">
            <div>
                <div class="brand-title">HOLDIT</div>
                <div class="brand-sub">Driver Payout & Settlement Statement</div>
            </div>
            <div class="badge">${settlement.paymentStatus || "PENDING"}</div>
        </div>

        <div class="section-title">Trip & Driver Details</div>
        <div class="info-grid">
            <div class="info-item">
                <label>Statement Number</label>
                <span>${settlement.settlementId}</span>
            </div>
            <div class="info-item">
                <label>Booking Code</label>
                <span>${settlement.bookingCode}</span>
            </div>
            <div class="info-item">
                <label>Driver Name</label>
                <span>${settlement.driver?.name || "Driver"}</span>
            </div>
            <div class="info-item">
                <label>Completed Date</label>
                <span>${formattedDate}</span>
            </div>
            <div class="info-item">
                <label>Service Type & Direction</label>
                <span>${settlement.tripRole} (${settlement.direction || settlement.tripType})</span>
            </div>
            <div class="info-item">
                <label>Payout Reference</label>
                <span>${settlement.payoutReference}</span>
            </div>
        </div>

        <div class="section-title">Route Information</div>
        <div class="route-box">
            <div class="route-point">
                <div class="point-dot"></div>
                <div class="point-info">
                    <label>PICKUP</label>
                    <p>${settlement.pickupLocation}</p>
                </div>
            </div>
            <div class="route-point">
                <div class="point-dot drop"></div>
                <div class="point-info">
                    <label>DROPOFF</label>
                    <p>${settlement.dropLocation}</p>
                </div>
            </div>
        </div>

        <div class="section-title">Earnings Breakdown</div>
        <table class="table">
            <thead>
                <tr>
                    <th>DESCRIPTION</th>
                    <th style="text-align: right;">AMOUNT (₹)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Base Delivery Transfer Fee</td>
                    <td class="amount">₹${(settlement.earnings?.baseFee || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Distance & Bonus Incentive</td>
                    <td class="amount">₹${(settlement.earnings?.incentive || 0).toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div class="total-row">
            <span class="total-label">NET DRIVER EARNING</span>
            <span class="total-amount">₹${(settlement.earnings?.netEarnings || 0).toFixed(2)}</span>
        </div>

        <div class="footer">
            <p>This is a computer generated payment statement for partner drivers.</p>
            <button class="btn-print" onclick="window.print()">Print / Download PDF</button>
        </div>
    </div>
</body>
</html>`;
}

export async function generateFinalInvoice(bookingId) {
    return await getCustomerInvoiceData(bookingId);
}
