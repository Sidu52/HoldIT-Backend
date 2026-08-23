/**
 * @swagger
 * /api/v1/payment/verify:
 *   post:
 *     summary: Verify Razorpay Payment Signature
 *     tags:
 *       - User Payment
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified successfully
 * 
 * /api/v1/payment/webhook:
 *   post:
 *     summary: Razorpay Payment Webhook Receiver
 *     tags:
 *       - User Payment
 *     responses:
 *       200:
 *         description: Webhook processed
 */
