/**
 * @swagger
 * tags:
 * - name: "User Booking"
 * description: "User Booking operations"
 */

/**
 * @swagger
 *   {{baseUrl}}/api/v1/user/booking?page=1&limit=10:
 *     get:
 *       summary: Booking User
 *       tags:
 *         - User Booking
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Bookings fetched successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       bookings:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               example: 699454c49ca9a0f45860433c
 *                             status:
 *                               type: string
 *                               example: cancelled
 *                             luggage:
 *                               type: object
 *                               properties:
 *                                 small:
 *                                   type: number
 *                                   example: 1
 *                                 medium:
 *                                   type: number
 *                                   example: 1
 *                                 large:
 *                                   type: number
 *                                   example: 0
 *                                 other:
 *                                   type: number
 *                                   example: 0
 *                                 totalCount:
 *                                   type: number
 *                                   example: 2
 *                               required:
 *                                 - small
 *                                 - medium
 *                                 - large
 *                                 - other
 *                                 - totalCount
 *                             pickupLocation:
 *                               type: object
 *                               properties:
 *                                 lat:
 *                                   type: number
 *                                   example: 19.1367
 *                                 lng:
 *                                   type: number
 *                                   example: 72.8295
 *                                 address:
 *                                   type: string
 *                                   example: Andheri West, Mumbai, Maharashtra
 *                               required:
 *                                 - lat
 *                                 - lng
 *                                 - address
 *                             pickup:
 *                               type: object
 *                               properties:
 *                                 scheduledAt:
 *                                   type: string
 *                                   example: "2026-02-20T15:30:00.000Z"
 *                               required:
 *                                 - scheduledAt
 *                             pricing:
 *                               type: object
 *                               properties:
 *                                 currency:
 *                                   type: string
 *                                   example: INR
 *                               required:
 *                                 - currency
 *                             payment:
 *                               type: object
 *                               properties:
 *                                 status:
 *                                   type: string
 *                                   example: PENDING
 *                               required:
 *                                 - status
 *                             timeline:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: created
 *                                   note:
 *                                     type: string
 *                                     example: Booking created by user
 *                                   updatedBy:
 *                                     type: string
 *                                     example: 696c879538ad2da77ca68d60
 *                                   updatedByModel:
 *                                     type: string
 *                                     example: User
 *                                   createdAt:
 *                                     type: string
 *                                     example: "2026-02-17T11:45:08.058Z"
 *                                 required:
 *                                   - status
 *                                   - note
 *                                   - updatedBy
 *                                   - updatedByModel
 *                                   - createdAt
 *                             createdAt:
 *                               type: string
 *                               example: "2026-02-17T11:45:08.088Z"
 *                             bookingCode:
 *                               type: string
 *                               example: "HLD-MLQJDMGO-F1B0F9"
 *                           required:
 *                             - _id
 *                             - status
 *                             - luggage
 *                             - pickupLocation
 *                             - pickup
 *                             - pricing
 *                             - payment
 *                             - timeline
 *                             - createdAt
 *                             - bookingCode
 *                       pagination:
 *                         type: object
 *                         properties:
 *                           currentPage:
 *                             type: number
 *                             example: 1
 *                           totalPages:
 *                             type: number
 *                             example: 2
 *                           totalItems:
 *                             type: number
 *                             example: 18
 *                           itemsPerPage:
 *                             type: number
 *                             example: 10
 *                           hasNextPage:
 *                             type: boolean
 *                             example: true
 *                           hasPrevPage:
 *                             type: boolean
 *                             example: false
 *                         required:
 *                           - currentPage
 *                           - totalPages
 *                           - totalItems
 *                           - itemsPerPage
 *                           - hasNextPage
 *                           - hasPrevPage
 *                     required:
 *                       - bookings
 *                       - pagination
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-14T05:23:12.286Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   {{baseUrl}}/api/v1/user/booking/:booking_id:
 *     get:
 *       summary: User Booking By ID
 *       tags:
 *         - User Booking
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Booking fetched successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 699454c49ca9a0f45860433c
 *                       userId:
 *                         type: string
 *                         example: 696c879538ad2da77ca68d60
 *                       storeId:
 *                         type: string
 *                         example: 69633722ab729be239a689c0
 *                       serviceAreaId:
 *                         type: string
 *                         example: 60a4d5c0f6a3a0a4f8d0b2ff
 *                       status:
 *                         type: string
 *                         example: cancelled
 *                       isActive:
 *                         type: boolean
 *                         example: false
 *                       luggage:
 *                         type: object
 *                         properties:
 *                           small:
 *                             type: number
 *                             example: 1
 *                           medium:
 *                             type: number
 *                             example: 1
 *                           large:
 *                             type: number
 *                             example: 0
 *                           other:
 *                             type: number
 *                             example: 0
 *                           totalCount:
 *                             type: number
 *                             example: 2
 *                         required:
 *                           - small
 *                           - medium
 *                           - large
 *                           - other
 *                           - totalCount
 *                       luggagePhotos:
 *                         type: object
 *                         properties:
 *                           pickup:
 *                             type: array
 *                             items:
 *                               type: string
 *                           store:
 *                             type: array
 *                             items:
 *                               type: string
 *                           delivery:
 *                             type: array
 *                             items:
 *                               type: string
 *                         required:
 *                           - pickup
 *                           - store
 *                           - delivery
 *                       pickupLocation:
 *                         type: object
 *                         properties:
 *                           lat:
 *                             type: number
 *                             example: 19.1367
 *                           lng:
 *                             type: number
 *                             example: 72.8295
 *                           address:
 *                             type: string
 *                             example: Andheri West, Mumbai, Maharashtra
 *                         required:
 *                           - lat
 *                           - lng
 *                           - address
 *                       deliveryLocation:
 *                         type: object
 *                         nullable: true
 *                       pickup:
 *                         type: object
 *                         properties:
 *                           scheduledAt:
 *                             type: string
 *                             example: "2026-02-20T15:30:00.000Z"
 *                         required:
 *                           - scheduledAt
 *                       pricing:
 *                         type: object
 *                         properties:
 *                           currency:
 *                             type: string
 *                             example: INR
 *                         required:
 *                           - currency
 *                       payment:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                             example: PENDING
 *                         required:
 *                           - status
 *                       timeline:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: created
 *                             note:
 *                               type: string
 *                               example: Booking created by user
 *                             updatedBy:
 *                               type: string
 *                               example: 696c879538ad2da77ca68d60
 *                             updatedByModel:
 *                               type: string
 *                               example: User
 *                             createdAt:
 *                               type: string
 *                               example: "2026-02-17T11:45:08.058Z"
 *                           required:
 *                             - status
 *                             - note
 *                             - updatedBy
 *                             - updatedByModel
 *                             - createdAt
 *                       lastStatusUpdatedAt:
 *                         type: string
 *                         example: "2026-02-17T11:46:25.168Z"
 *                       createdAt:
 *                         type: string
 *                         example: "2026-02-17T11:45:08.088Z"
 *                       updatedAt:
 *                         type: string
 *                         example: "2026-02-17T11:46:25.169Z"
 *                       bookingCode:
 *                         type: string
 *                         example: "HLD-MLQJDMGO-F1B0F9"
 *                       cancelReason:
 *                         type: string
 *                         example: All nearby drivers are unavailable at the moment.
 *                       cancelledAt:
 *                         type: string
 *                         example: "2026-02-17T11:46:25.168Z"
 *                       cancelledBy:
 *                         type: string
 *                         example: SYSTEM
 *                     required:
 *                       - _id
 *                       - userId
 *                       - storeId
 *                       - serviceAreaId
 *                       - status
 *                       - isActive
 *                       - luggage
 *                       - luggagePhotos
 *                       - pickupLocation
 *                       - deliveryLocation
 *                       - pickup
 *                       - pricing
 *                       - payment
 *                       - timeline
 *                       - lastStatusUpdatedAt
 *                       - createdAt
 *                       - updatedAt
 *                       - bookingCode
 *                       - cancelReason
 *                       - cancelledAt
 *                       - cancelledBy
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-14T05:26:32.386Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   {{baseUrl}}/api/v1/user/booking/active:
 *     get:
 *       summary: User Active Booking
 *       tags:
 *         - User Booking
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Active bookings fetched successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       bookings:
 *                         type: array
 *                         items:
 *                           type: string
 *                       total:
 *                         type: number
 *                         example: 0
 *                     required:
 *                       - bookings
 *                       - total
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-14T05:46:49.578Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   {{baseUrl}}/api/v1/user/booking/history?page=1&limit=10:
 *     get:
 *       summary: User Booking History
 *       tags:
 *         - User Booking
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Booking history fetched successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       bookings:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               example: 699454c49ca9a0f45860433c
 *                             status:
 *                               type: string
 *                               example: cancelled
 *                             luggage:
 *                               type: object
 *                               properties:
 *                                 small:
 *                                   type: number
 *                                   example: 1
 *                                 medium:
 *                                   type: number
 *                                   example: 1
 *                                 large:
 *                                   type: number
 *                                   example: 0
 *                                 other:
 *                                   type: number
 *                                   example: 0
 *                                 totalCount:
 *                                   type: number
 *                                   example: 2
 *                               required:
 *                                 - small
 *                                 - medium
 *                                 - large
 *                                 - other
 *                                 - totalCount
 *                             pickupLocation:
 *                               type: object
 *                               properties:
 *                                 lat:
 *                                   type: number
 *                                   example: 19.1367
 *                                 lng:
 *                                   type: number
 *                                   example: 72.8295
 *                                 address:
 *                                   type: string
 *                                   example: Andheri West, Mumbai, Maharashtra
 *                               required:
 *                                 - lat
 *                                 - lng
 *                                 - address
 *                             pickup:
 *                               type: object
 *                               properties:
 *                                 scheduledAt:
 *                                   type: string
 *                                   example: "2026-02-20T15:30:00.000Z"
 *                               required:
 *                                 - scheduledAt
 *                             pricing:
 *                               type: object
 *                               properties:
 *                                 currency:
 *                                   type: string
 *                                   example: INR
 *                               required:
 *                                 - currency
 *                             payment:
 *                               type: object
 *                               properties:
 *                                 status:
 *                                   type: string
 *                                   example: PENDING
 *                               required:
 *                                 - status
 *                             timeline:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: created
 *                                   note:
 *                                     type: string
 *                                     example: Booking created by user
 *                                   updatedBy:
 *                                     type: string
 *                                     example: 696c879538ad2da77ca68d60
 *                                   updatedByModel:
 *                                     type: string
 *                                     example: User
 *                                   createdAt:
 *                                     type: string
 *                                     example: "2026-02-17T11:45:08.058Z"
 *                                 required:
 *                                   - status
 *                                   - note
 *                                   - updatedBy
 *                                   - updatedByModel
 *                                   - createdAt
 *                             createdAt:
 *                               type: string
 *                               example: "2026-02-17T11:45:08.088Z"
 *                             bookingCode:
 *                               type: string
 *                               example: "HLD-MLQJDMGO-F1B0F9"
 *                             cancelReason:
 *                               type: string
 *                               example: All nearby drivers are unavailable at the moment.
 *                             cancelledAt:
 *                               type: string
 *                               example: "2026-02-17T11:46:25.168Z"
 *                             cancelledBy:
 *                               type: string
 *                               example: SYSTEM
 *                           required:
 *                             - _id
 *                             - status
 *                             - luggage
 *                             - pickupLocation
 *                             - pickup
 *                             - pricing
 *                             - payment
 *                             - timeline
 *                             - createdAt
 *                             - bookingCode
 *                             - cancelReason
 *                             - cancelledAt
 *                             - cancelledBy
 *                       pagination:
 *                         type: object
 *                         properties:
 *                           currentPage:
 *                             type: number
 *                             example: 1
 *                           totalPages:
 *                             type: number
 *                             example: 2
 *                           totalItems:
 *                             type: number
 *                             example: 18
 *                           itemsPerPage:
 *                             type: number
 *                             example: 10
 *                           hasNextPage:
 *                             type: boolean
 *                             example: true
 *                           hasPrevPage:
 *                             type: boolean
 *                             example: false
 *                         required:
 *                           - currentPage
 *                           - totalPages
 *                           - totalItems
 *                           - itemsPerPage
 *                           - hasNextPage
 *                           - hasPrevPage
 *                     required:
 *                       - bookings
 *                       - pagination
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-14T05:50:38.741Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   {{baseUrl}}/api/v1/user/booking/:booking_id/cancel:
 *     put:
 *       summary: Cancel Booking
 *       tags:
 *         - User Booking
 *       responses:
 *         200:
 *           description: Successful response
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   {{baseUrl}}/api/v1/user/booking:
 *     post:
 *       summary: Shedule Pickup
 *       tags:
 *         - User Booking
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 201
 *                   message:
 *                     type: string
 *                     example: Pickup scheduled successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       bookingId:
 *                         type: string
 *                         example: 69b50da1699a6f97552c873f
 *                       bookingCode:
 *                         type: string
 *                         example: "HLD-MMQ057OX-3FC648"
 *                       status:
 *                         type: string
 *                         example: store_assigned
 *                       scheduledAt:
 *                         type: string
 *                         example: "2026-03-14T15:30:00.000Z"
 *                       totalCount:
 *                         type: number
 *                         example: 2
 *                       store:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: 69633722ab729be239a689c0
 *                           name:
 *                             type: string
 *                             example: Naveen's Store
 *                           address:
 *                             type: string
 *                             example: Mangalore, India
 *                           distanceKm:
 *                             type: number
 *                             example: 0
 *                         required:
 *                           - id
 *                           - name
 *                           - address
 *                           - distanceKm
 *                     required:
 *                       - bookingId
 *                       - bookingCode
 *                       - status
 *                       - scheduledAt
 *                       - totalCount
 *                       - store
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-14T07:26:25.707Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
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
 *                   example: "2026-03-14T15:30:00.000Z"
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

