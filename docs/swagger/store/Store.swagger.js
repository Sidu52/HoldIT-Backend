/**
 * @swagger
 *   /api/v1/store/profile:
 *     get:
 *       summary: Store Profile
 *       tags:
 *         - Store
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
 *   /api/v1/store/profile:
 *     put:
 *       summary: Update Store Profile
 *       tags:
 *         - Store
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
 *                 store_name:
 *                   type: string
 *                   example: FreshMart Grocery
 *                 store_address:
 *                   type: string
 *                   example: 123 Market Street, Andheri East, Mumbai, Maharashtra 400069
 *                 store_open_time:
 *                   type: string
 *                   example: "09:00"
 *                 store_close_time:
 *                   type: string
 *                   example: "22:00"
 *                 store_description:
 *                   type: string
 *                   example: A neighborhood grocery store offering fresh fruits, vegetables, dairy products, and daily essentials.
 *                 store_contact_number:
 *                   type: number
 *                   example: 9876543210
 *               required:
 *                 - store_name
 *                 - store_address
 *                 - store_open_time
 *                 - store_close_time
 *                 - store_description
 *                 - store_contact_number
 */

/**
 * @swagger
 *   /api/v1/store/complete-profile:
 *     post:
 *       summary: Complete Store Profile
 *       tags:
 *         - Store
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
 *                 store_name:
 *                   type: string
 *                   example: FreshMart Grocery
 *                 store_address:
 *                   type: string
 *                   example: 123 Market Street, Andheri East, Mumbai, Maharashtra 400069
 *                 store_open_time:
 *                   type: string
 *                   example: "09:00"
 *                 store_close_time:
 *                   type: string
 *                   example: "22:00"
 *                 store_description:
 *                   type: string
 *                   example: A neighborhood grocery store offering fresh fruits, vegetables, dairy products, and daily essentials.
 *                 store_contact_number:
 *                   type: string
 *                   example: 9876543210
 *                 lat:
 *                   type: number
 *                   example: 19.1367
 *                 lng:
 *                   type: number
 *                   example: 72.8295
 *                 address:
 *                   type: string
 *                   example: 123 Market Street, Andheri East, Mumbai, Maharashtra 400069
 *               required:
 *                 - store_name
 *                 - store_address
 *                 - store_open_time
 *                 - store_close_time
 *                 - store_description
 *                 - store_contact_number
 *                 - lat
 *                 - lng
 *                 - address
 */

/**
 * @swagger
 *   /api/v1/store/status/online:
 *     put:
 *       summary: Go Online
 *       tags:
 *         - Store
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
 *   /api/v1/store/status/offline:
 *     put:
 *       summary: Go Offline
 *       tags:
 *         - Store
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
 *   /api/v1/store/bookings/incoming:
 *     get:
 *       summary: Incoming Bookings
 *       tags:
 *         - Store
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
 *   /api/v1/store/bookings/active:
 *     get:
 *       summary: Active Bookings
 *       tags:
 *         - Store
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
 *   /api/v1/store/bookings/history:
 *     get:
 *       summary: Bookings History
 *       tags:
 *         - Store
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
 *   /api/v1/store/bookings/:booking_id:
 *     get:
 *       summary: Booking By ID
 *       tags:
 *         - Store
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