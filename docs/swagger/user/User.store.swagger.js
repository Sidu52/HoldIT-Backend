/**
 * @swagger
 * /api/v1/user/stores/availability:
 *   get:
 *     summary: Check Luggage Store Availability Near Location
 *     tags:
 *       - User Stores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Availability status and store details
 */
