/**
 * @swagger
 * /api/v1/user/payment/checkout:
 *   post:
 *     summary: Dummy payment checkout for a booking
 *     tags: [User Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true,
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *               paymentMethod:
 *                 type: string
 *                 default: "dummy_card"
 *                 example: "credit_card"
 *     responses:
 *       200:
 *         description: Payment successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookingId:
 *                       type: string
 *                     transactionId:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Bad request (missing fields or already paid)
 *       404:
 *         description: Booking not found
 */
