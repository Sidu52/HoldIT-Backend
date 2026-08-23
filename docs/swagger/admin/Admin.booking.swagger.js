/**
 * @swagger
 * /api/v1/admin/booking:
 *   get:
 *     summary: List All Bookings
 *     tags:
 *       - Admin Bookings
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
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of bookings
 * 
 * /api/v1/admin/booking/payment/{bookingId}:
 *   get:
 *     summary: Get Payment Details for Booking
 *     tags:
 *       - Admin Bookings
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
 *         description: Payment record returned
 * 
 * /api/v1/admin/booking/{id}:
 *   get:
 *     summary: Get Booking Details by ID
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking record details
 * 
 * /api/v1/admin/booking/{id}/cancel:
 *   put:
 *     summary: Cancel Booking Manually
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled
 * 
 * /api/v1/admin/booking/{id}/assign-driver:
 *   patch:
 *     summary: Assign Driver to Booking
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver assigned
 * 
 * /api/v1/admin/booking/{id}/reassign-store:
 *   patch:
 *     summary: Reassign Store for Booking
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - storeId
 *             properties:
 *               storeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Store reassigned
 * 
 * /api/v1/admin/booking/{id}/assign-return-driver:
 *   patch:
 *     summary: Assign Return Driver to Booking
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Return driver assigned
 * 
 * /api/v1/admin/booking/{id}/mark-arrived:
 *   patch:
 *     summary: Mark Driver Arrived at Pickup
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status updated to DRIVER_ARRIVED
 * 
 * /api/v1/admin/booking/{id}/mark-picked-up:
 *   patch:
 *     summary: Mark Luggage Picked Up
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status updated to PICKED_UP
 * 
 * /api/v1/admin/booking/{id}/mark-stored:
 *   patch:
 *     summary: Mark Luggage Stored at Store
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status updated to STORED
 * 
 * /api/v1/admin/booking/{id}/request-return:
 *   patch:
 *     summary: Request Return Manually for Booking
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Return requested
 * 
 * /api/v1/admin/booking/{id}/mark-delivered:
 *   patch:
 *     summary: Mark Booking Delivered to User
 *     tags:
 *       - Admin Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status updated to DELIVERED
 */