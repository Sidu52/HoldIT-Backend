/**
 * @swagger
 * /api/v1/driver/rides/offer/pending:
 *   get:
 *     summary: Get Pending Dispatch Ride Offer
 *     tags:
 *       - Driver Rides
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending ride offer details
 * 
 * /api/v1/driver/rides/assigned:
 *   get:
 *     summary: Get Assigned Rides List
 *     tags:
 *       - Driver Rides
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned rides list
 * 
 * /api/v1/driver/rides/active:
 *   get:
 *     summary: Get Active Current Ride
 *     tags:
 *       - Driver Rides
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active ride details
 * 
 * /api/v1/driver/rides/history:
 *   get:
 *     summary: Get Completed Ride History
 *     tags:
 *       - Driver Rides
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver ride history
 * 
 * /api/v1/driver/rides/{booking_id}:
 *   get:
 *     summary: Get Ride Details by Booking ID
 *     tags:
 *       - Driver Rides
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
 *         description: Full ride details
 * 
 * /api/v1/driver/rides/{booking_id}/accept:
 *   post:
 *     summary: Accept Ride Offer
 *     tags:
 *       - Driver Rides
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
 *         description: Ride accepted
 * 
 * /api/v1/driver/rides/{booking_id}/reject:
 *   post:
 *     summary: Reject Ride Offer
 *     tags:
 *       - Driver Rides
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
 *         description: Ride rejected
 * 
 * /api/v1/driver/rides/{booking_id}/arrive-pickup:
 *   put:
 *     summary: Mark Driver Arrived at Pickup Location
 *     tags:
 *       - Driver Rides
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
 *         description: Status updated to DRIVER_ARRIVED
 * 
 * /api/v1/driver/rides/{booking_id}/complete-pickup:
 *   put:
 *     summary: Complete Luggage Pickup at User Location
 *     tags:
 *       - Driver Rides
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "1234"
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Status updated to PICKED_UP
 * 
 * /api/v1/driver/rides/{booking_id}/complete-pickup-at-store:
 *   put:
 *     summary: Complete Return Luggage Pickup at Store
 *     tags:
 *       - Driver Rides
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
 *         description: Status updated to OUT_FOR_RETURN
 * 
 * /api/v1/driver/rides/{booking_id}/arrive-store:
 *   put:
 *     summary: Mark Driver Arrived at Storage Store (Pickup Flow)
 *     tags:
 *       - Driver Rides
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
 *         description: Status updated to AT_STORE
 * 
 * /api/v1/driver/rides/{booking_id}/arrive-store-return:
 *   put:
 *     summary: Mark Driver Arrived at Storage Store (Return Flow)
 *     tags:
 *       - Driver Rides
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
 *         description: Driver arrived at store for return pickup
 * 
 * /api/v1/driver/rides/{booking_id}/cancel:
 *   post:
 *     summary: Cancel Ride by Driver
 *     tags:
 *       - Driver Rides
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
 *                 example: Vehicle issue
 *     responses:
 *       200:
 *         description: Ride cancelled
 * 
 * /api/v1/driver/rides/{booking_id}/arrive-delivery:
 *   put:
 *     summary: Mark Driver Arrived at Delivery Location
 *     tags:
 *       - Driver Rides
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
 *         description: Status updated to ARRIVED_FOR_DELIVERY
 * 
 * /api/v1/driver/rides/{booking_id}/complete-delivery:
 *   put:
 *     summary: Complete Luggage Return Delivery to User
 *     tags:
 *       - Driver Rides
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "5678"
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Status updated to DELIVERED
 */
