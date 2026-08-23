/**
 * @swagger
 * /api/v1/user/booking:
 *   get:
 *     summary: List User Bookings
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of user bookings
 *   post:
 *     summary: Schedule Luggage Pickup (Create Booking)
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickupLocation
 *               - luggage
 *             properties:
 *               pickupLocation:
 *                 type: object
 *                 required:
 *                   - lat
 *                   - lng
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: 19.2286
 *                   lng:
 *                     type: number
 *                     example: 72.8284
 *                   address:
 *                     type: string
 *                     example: 101 Marine Drive
 *               luggage:
 *                 type: object
 *                 properties:
 *                   small:
 *                     type: integer
 *                     example: 1
 *                   medium:
 *                     type: integer
 *                     example: 1
 *                   large:
 *                     type: integer
 *                     example: 0
 *                   other:
 *                     type: integer
 *                     example: 0
 *               userInfo:
 *                 type: object
 *                 properties:
 *                   firstName:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   phone:
 *                     type: string
 *               tipAmount:
 *                 type: number
 *                 example: 50
 *               couponCode:
 *                 type: string
 *                 example: WELCOME50
 *               notes:
 *                 type: string
 *                 example: Handle with care
 *     responses:
 *       201:
 *         description: Booking scheduled and Razorpay payment order created
 * 
 * /api/v1/user/booking/active:
 *   get:
 *     summary: Get Active In-Progress Bookings
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active bookings
 * 
 * /api/v1/user/booking/history:
 *   get:
 *     summary: Get Completed / Cancelled Booking History
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Booking history list
 * 
 * /api/v1/user/booking/{booking_id}:
 *   get:
 *     summary: Get Booking Details by ID
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: booking_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking details and timeline
 * 
 * /api/v1/user/booking/{bookingId}/payment/retry:
 *   post:
 *     summary: Retry Payment for Pending Booking
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: New Razorpay order generated
 * 
 * /api/v1/user/booking/{booking_id}/cancel:
 *   put:
 *     summary: Cancel Booking
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: booking_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Plans changed
 *     responses:
 *       200:
 *         description: Booking cancelled
 * 
 * /api/v1/user/booking/{booking_id}/return-request:
 *   post:
 *     summary: Request Return Delivery of Stored Luggage
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: booking_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - returnLocation
 *             properties:
 *               returnLocation:
 *                 type: object
 *                 required:
 *                   - lat
 *                   - lng
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *                   address:
 *                     type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Return request registered
 * 
 * /api/v1/user/booking/{booking_id}/assign-driver:
 *   get:
 *     summary: Get Assigned Pickup/Return Driver Details
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: booking_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver contact and vehicle details
 * 
 * /api/v1/user/booking/{booking_id}/assign-store:
 *   get:
 *     summary: Get Assigned Luggage Store Details
 *     tags:
 *       - User Booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: booking_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store address and contact details
 */