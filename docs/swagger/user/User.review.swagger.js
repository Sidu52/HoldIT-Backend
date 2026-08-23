/**
 * @swagger
 * /api/v1/user/reviews:
 *   get:
 *     summary: Get User Service Reviews
 *     tags:
 *       - User Reviews
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of submitted reviews
 *   post:
 *     summary: Create Review for Completed Booking
 *     tags:
 *       - User Reviews
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *               - rating
 *             properties:
 *               bookingId:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comment:
 *                 type: string
 *                 example: Excellent luggage storage service!
 *     responses:
 *       201:
 *         description: Review submitted
 */
