/**
 * @swagger
 *   /api/v1/admin/booking:
 *     get:
 *       summary: Get All Bookings
 *       tags:
 *         - Booking
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
 *   /api/v1/admin/booking/:booking_id:
 *     get:
 *       summary: Booking By ID
 *       tags:
 *         - Booking
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
 *   /api/v1/admin/booking/:booking_id/cancel:
 *     put:
 *       summary: Cancel Booking
 *       tags:
 *         - Booking
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
 *                 auth_id:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *                 status:
 *                   type: string
 *                   example: active
 *                 reason:
 *                   type: string
 *                   example: Verified Manually
 *               required:
 *                 - auth_id
 *                 - status
 *                 - reason
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/assign-driver:
 *     patch:
 *       summary: Assign Driver
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/reassign-driver:
 *     patch:
 *       summary: Reassign Driver
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/reassign-store:
 *     patch:
 *       summary: Reassign Store
 *       tags:
 *         - Booking
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
 *                 storeId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - storeId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/assign-return-driver:
 *     patch:
 *       summary: Assign Return Driver
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/mark-arrived:
 *     patch:
 *       summary: Mark Arrived
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/mark-picked-up:
 *     patch:
 *       summary: Mark Picked Up
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/mark-stored:
 *     patch:
 *       summary: Mark Stored
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/request-return:
 *     patch:
 *       summary: Request Return
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */

/**
 * @swagger
 *   /api/v1/admin/booking/:booking_id/mark-delivered:
 *     patch:
 *       summary: Mark Delivered
 *       tags:
 *         - Booking
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
 *                 driverId:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *               required:
 *                 - driverId
 */