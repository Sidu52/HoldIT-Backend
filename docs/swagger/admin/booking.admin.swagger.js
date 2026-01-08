/**
 * @swagger
 * tags:
 *   name: Admin Booking
 *   description: Admin booking management APIs
 */

/**
 * @swagger
 * /admin/booking:
 *   get:
 *     summary: Get bookings with filters and pagination
 *     tags: [Admin Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of records per page (default 10)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: completed
 *         description: Filter by booking status
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           example: 65ab12fe90c11a
 *         description: Filter bookings by user ID
 *     responses:
 *       200:
 *         description: Bookings fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Bookings fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 65af23cd91aa21
 *                           status:
 *                             type: string
 *                             example: completed
 *                           totalAmount:
 *                             type: number
 *                             example: 250
 *                           userId:
 *                             type: string
 *                             example: 65ab12fe90c11a
 *                           createdAt:
 *                             type: string
 *                             example: 2026-01-06T10:30:00Z
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                           example: 1
 *                         limit:
 *                           type: number
 *                           example: 10
 *                         totalPages:
 *                           type: number
 *                           example: 5
 *                         totalRecords:
 *                           type: number
 *                           example: 45
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
