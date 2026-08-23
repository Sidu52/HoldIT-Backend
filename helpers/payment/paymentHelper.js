import { razorpay } from "../../config/razorpay.js";
import Payment, { PAYMENT_STATUS, canTransitionPaymentStatus } from "../../models/Payment.js";
import Earning, { EARNING_STATUS } from "../../models/Earning.js";
import Money from "../../utils/money.js";
import logger from "../../utils/logger.js";

/**
 * Idempotently refunds a captured Razorpay payment and updates the local
 * Payment record and vendor Earning records.
 *
 * @param {string|ObjectId} paymentId - internal Payment _id
 * @param {object} [opts]
 * @param {string} [opts.reason] - audit reason
 * @param {number} [opts.amountMinor] - refund amount in paise; defaults to full remaining
 */
export async function triggerAutoRefund(paymentId, opts = {}) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
        throw new Error(`[triggerAutoRefund] Payment ${paymentId} not found`);
    }

    if (payment.status !== PAYMENT_STATUS.CAPTURED && payment.status !== PAYMENT_STATUS.PARTIALLY_REFUNDED) {
        logger.warn(`[triggerAutoRefund] Payment ${paymentId} has status '${payment.status}' — not eligible for refund.`);
        return { refunded: false, alreadyRefunded: false, refund: null };
    }

    const totalAmountMinor = payment.amountMinor || Money.fromMajor(payment.amount || 0);
    const totalRefundedMinor = payment.amountRefundedMinor || Money.fromMajor(payment.amountRefunded || 0);
    const remainingAmountMinor = Money.subtract(totalAmountMinor, totalRefundedMinor);

    if (remainingAmountMinor <= 0) {
        logger.info(`[triggerAutoRefund] Payment ${paymentId} already fully refunded — no-op.`);
        return { refunded: false, alreadyRefunded: true, refund: null };
    }

    if (!payment.razorpayPaymentId) {
        throw new Error(`[triggerAutoRefund] Payment ${paymentId} is captured but missing razorpayPaymentId — cannot refund.`);
    }

    const requestedRefundMinor = opts.amountMinor ?? remainingAmountMinor;
    if (requestedRefundMinor > remainingAmountMinor) {
        throw new Error(`[triggerAutoRefund] Requested refund (${requestedRefundMinor}) exceeds remaining refundable (${remainingAmountMinor}) for payment ${paymentId}`);
    }

    const idempotencyKey = `refund-${payment._id}-${totalRefundedMinor}`;

    let refund;
    try {
        refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
            amount: requestedRefundMinor, // Razorpay SDK accepts paise integer
            speed: "normal",
            notes: {
                paymentDocId: payment._id.toString(),
                bookingId: payment.bookingId.toString(),
                reason: opts.reason || "System-initiated auto-refund",
            },
            receipt: idempotencyKey,
        });
    } catch (err) {
        if (err?.error?.description?.toLowerCase().includes("already refunded")) {
            logger.warn(`[triggerAutoRefund] Razorpay reports payment ${payment.razorpayPaymentId} already refunded — syncing local state.`);
            payment.status = PAYMENT_STATUS.REFUNDED;
            payment.amountRefundedMinor = totalAmountMinor;
            payment.amountRefunded = Money.fromMinor(totalAmountMinor);
            payment.refundedAt = new Date();
            await payment.save();

            // Cancel any pending earnings for this payment
            await Earning.updateMany(
                { paymentId: payment._id, status: { $in: [EARNING_STATUS.PENDING, EARNING_STATUS.ELIGIBLE] } },
                { $set: { status: EARNING_STATUS.CANCELLED } }
            );

            return { refunded: true, alreadyRefunded: true, refund: null };
        }
        logger.error(`[triggerAutoRefund] Razorpay refund call failed for payment ${paymentId}:`, err);
        throw err;
    }

    const newTotalRefundedMinor = Money.add(totalRefundedMinor, requestedRefundMinor);
    const targetStatus = newTotalRefundedMinor >= totalAmountMinor
        ? PAYMENT_STATUS.REFUNDED
        : PAYMENT_STATUS.PARTIALLY_REFUNDED;

    if (!canTransitionPaymentStatus(payment.status, targetStatus)) {
        throw new Error(`[triggerAutoRefund] Cannot transition payment ${paymentId} from '${payment.status}' to '${targetStatus}'`);
    }

    payment.amountRefundedMinor = newTotalRefundedMinor;
    payment.amountRefunded = Money.fromMinor(newTotalRefundedMinor);
    payment.status = targetStatus;
    payment.refundedAt = new Date();
    await payment.save();

    // Reconcile/cancel un-disbursed earnings if fully refunded
    if (targetStatus === PAYMENT_STATUS.REFUNDED) {
        await Earning.updateMany(
            { paymentId: payment._id, status: { $in: [EARNING_STATUS.PENDING, EARNING_STATUS.ELIGIBLE] } },
            { $set: { status: EARNING_STATUS.CANCELLED } }
        );
    }

    logger.info(`[triggerAutoRefund] Refunded ₹${Money.fromMinor(requestedRefundMinor)} for payment ${paymentId} (Razorpay refund id: ${refund.id})`);

    return { refunded: true, alreadyRefunded: false, refund };
}