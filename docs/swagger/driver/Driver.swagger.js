/**
 * @swagger
 *   /api/v1/driver:
 *     get:
 *       summary: Driver Profile
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/update-driver-status:
 *     put:
 *       summary: Driver On Duty Status
 *       tags:
 *         - Driver API
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
 *                 is_online:
 *                   type: boolean
 *                   example: true
 *               required:
 *                 - is_online
 */

/**
 * @swagger
 *   /api/v1/driver/update-driver-location:
 *     put:
 *       summary: Update Driver Location
 *       tags:
 *         - Driver API
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
 *                 lng:
 *                   type: number
 *                   example: 19.1367
 *                 lat:
 *                   type: number
 *                   example: 72.8295
 *               required:
 *                 - lng
 *                 - lat
 */

/**
 * @swagger
 *   /api/v1/driver/update-driver-info:
 *     put:
 *       summary: Driver Update Info
 *       tags:
 *         - Driver API
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
 *                 first_name:
 *                   type: string
 *                   example: SS
 *                 is_on_trip:
 *                   type: boolean
 *                   example: false
 *               required:
 *                 - first_name
 *                 - is_on_trip
 */

/**
 * @swagger
 *   /api/v1/driver/rides/assigned:
 *     get:
 *       summary: Assigned Rides
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/active:
 *     get:
 *       summary: Active Rides
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/history:
 *     get:
 *       summary: Rides History
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/offer/pending:
 *     get:
 *       summary: Pending Ride Offers
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/:booking_id/accept:
 *     post:
 *       summary: Accept Ride
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/:booking_id/reject:
 *     post:
 *       summary: Reject Ride
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/:booking_id/cancel:
 *     post:
 *       summary: Cancel Ride
 *       tags:
 *         - Driver API
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
 *                   example: I am unable to deliver order please cancel it.
 *               required:
 *                 - reason
 */

/**
 * @swagger
 *   /api/v1/driver/rides/:booking_id/arrive-pickup:
 *     put:
 *       summary: Arrived at Pickup
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/:booking_id/complete-pickup:
 *     put:
 *       summary: Complete Pickup with OTP and Photos
 *       tags:
 *         - Driver API
 *       security:
 *         - bearerAuth: []
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               properties:
 *                 otp:
 *                   type: string
 *                   example: "123456"
 *                 photos:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: binary
 *       responses:
 *         200:
 *           description: Successful response
 */

/**
 * @swagger
 *   /api/v1/driver/rides/:booking_id/arrive-store:
 *     put:
 *       summary: Arrived at Store
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/rides/:booking_id/mark-stored:
 *     put:
 *       summary: Mark Stored
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/bookings/:bookingId/accept:
 *     post:
 *       summary: Accept Booking
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/bookings/:bookingId/arrived:
 *     post:
 *       summary: Driver Arrived
 *       tags:
 *         - Driver API
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
 *   /api/v1/driver/bookings/:bookingId/confirm-pickup:
 *     post:
 *       summary: Confirm Pickup
 *       tags:
 *         - Driver API
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
 *                 otp:
 *                   type: string
 *                   example: 481068
 *               required:
 *                 - otp
 */

/**
 * @swagger
 *   /api/v1/driver/rides/:booking_id/complete-delivery:
 *     put:
 *       summary: Complete Delivery with OTP and Photos
 *       tags:
 *         - Driver API
 *       security:
 *         - bearerAuth: []
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               properties:
 *                 otp:
 *                   type: string
 *                   example: "123456"
 *                 photos:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: binary
 *       responses:
 *         200:
 *           description: Successful response
 */