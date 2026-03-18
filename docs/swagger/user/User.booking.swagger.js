/**
 * @swagger
 *   /api/v1/user/booking:
 *     get:
 *       summary: Bookings
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/booking/history:
 *     get:
 *       summary: Bookings History
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/booking/active:
 *     get:
 *       summary: Active Booking
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/booking/:booking_id:
 *     get:
 *       summary: Booking By Id
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/booking:
 *     post:
 *       summary: Schedule Booking
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pickupLocation:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                       example: 19.1367
 *                     lng:
 *                       type: number
 *                       example: 72.8295
 *                     address:
 *                       type: string
 *                       example: Andheri West, Mumbai, Maharashtra
 *                   required:
 *                     - lat
 *                     - lng
 *                     - address
 *                 pickupScheduledAt:
 *                   type: string
 *                   example: "2026-03-18T15:30:00.000Z"
 *                 luggage:
 *                   type: object
 *                   properties:
 *                     small:
 *                       type: number
 *                       example: 1
 *                     medium:
 *                       type: number
 *                       example: 1
 *                     large:
 *                       type: number
 *                       example: 0
 *                     other:
 *                       type: number
 *                       example: 0
 *                   required:
 *                     - small
 *                     - medium
 *                     - large
 *                     - other
 *                 notes:
 *                   type: string
 *                   example: Please call 15 minutes before arrival.
 *               required:
 *                 - pickupLocation
 *                 - pickupScheduledAt
 *                 - luggage
 *                 - notes
 */

/**
 * @swagger
 *   /api/v1/user/booking/:booking_id/cancel:
 *     put:
 *       summary: Cancel Booking
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reason:
 *                   type: string
 *                   example: Testing
 *               required:
 *                 - reason
 */

/**
 * @swagger
 *   /api/v1/user/booking/:booking_id/assign-store:
 *     get:
 *       summary: Assign Store
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/booking/:booking_id/assign-driver:
 *     get:
 *       summary: Assign Driver
 *       tags:
 *         - Bookings
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */