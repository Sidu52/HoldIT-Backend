/**
 * @swagger
 * /api/v1/driver:
 *   get:
 *     summary: Get Driver Profile Details
 *     tags:
 *       - Driver Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver profile returned
 * 
 * /api/v1/driver/stats:
 *   get:
 *     summary: Get Driver Trip Stats & Earnings Summary
 *     tags:
 *       - Driver Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver statistics returned
 * 
 * /api/v1/driver/update-driver-info:
 *   put:
 *     summary: Update Driver Profile Info
 *     tags:
 *       - Driver Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 * 
 * /api/v1/driver/update-driver-location:
 *   put:
 *     summary: Update Driver Live GPS Location
 *     tags:
 *       - Driver Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 19.2286
 *               lng:
 *                 type: number
 *                 example: 72.8284
 *     responses:
 *       200:
 *         description: Driver location cached in Redis
 * 
 * /api/v1/driver/update-driver-status:
 *   put:
 *     summary: Toggle Driver Duty Status (Online / Offline)
 *     tags:
 *       - Driver Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_online
 *             properties:
 *               is_online:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Duty status updated
 * 
 * /api/v1/driver/bookings/active:
 *   get:
 *     summary: Get Active Assigned Booking for Driver
 *     tags:
 *       - Driver Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current active booking details
 * 
 * /api/v1/driver/bookings/{bookingId}/accept:
 *   post:
 *     summary: Accept Booking Offer
 *     tags:
 *       - Driver Profile
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
 *         description: Booking accepted successfully
 * 
 * /api/v1/driver/bookings/{bookingId}/reject:
 *   post:
 *     summary: Reject Booking Offer
 *     tags:
 *       - Driver Profile
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
 *         description: Booking rejected
 */