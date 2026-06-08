/**
 * @swagger
 * /api/v1/user/reviews:
 *   post:
 *     summary: Create a review for a Driver or Store
 *     tags: [User Reviews]
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
 *               - rating
 *               - reviewType
 *             properties:
 *               bookingId:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               reviewType:
 *                 type: string
 *                 enum: [DRIVER, STORE]
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review submitted
 *       400:
 *         description: Invalid status or missing fields
 *       409:
 *         description: Already reviewed
 *
 *   get:
 *     summary: Get reviews for a Driver or Store
 *     tags: [User Reviews]
 *     parameters:
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Reviews fetched successfully
 */
