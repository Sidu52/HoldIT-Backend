/**
 * @swagger
 * /api/v1/store/profile:
 *   get:
 *     summary: Get Store Profile Details
 *     tags:
 *       - Store Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store profile data
 *   put:
 *     summary: Update Store Profile Details
 *     tags:
 *       - Store Profile
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
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 * 
 * /api/v1/store/status/online:
 *   put:
 *     summary: Update Store Online/Offline Open Status
 *     tags:
 *       - Store Profile
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
 *         description: Online status updated
 * 
 * /api/v1/store/dashboard:
 *   get:
 *     summary: Get Store Dashboard Analytics & Capacity Summary
 *     tags:
 *       - Store Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 * 
 * /api/v1/store/bookings/incoming:
 *   get:
 *     summary: Get Incoming Luggage Drop-offs
 *     tags:
 *       - Store Bookings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of incoming bookings en route to store
 * 
 * /api/v1/store/bookings/active:
 *   get:
 *     summary: Get Currently Stored Luggage Parcels
 *     tags:
 *       - Store Bookings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of stored luggage items in facility
 * 
 * /api/v1/store/bookings/return_parcels:
 *   get:
 *     summary: Get Parcels Scheduled for Return Pickup
 *     tags:
 *       - Store Bookings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of return parcels
 * 
 * /api/v1/store/bookings/history:
 *   get:
 *     summary: Get Completed Storage History
 *     tags:
 *       - Store Bookings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Storage history
 * 
 * /api/v1/store/bookings/{booking_id}:
 *   get:
 *     summary: Get Booking Details for Store Staff
 *     tags:
 *       - Store Bookings
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
 *         description: Detailed booking and parcel info
 * 
 * /api/v1/store/bookings/{booking_id}/confirm-stored:
 *   post:
 *     summary: Confirm Luggage Accepted and Stored in Store Facility
 *     tags:
 *       - Store Bookings
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
 *             properties:
 *               shelfNumber:
 *                 type: string
 *                 example: "A-12"
 *               notes:
 *                 type: string
 *                 example: Verified 2 bags
 *     responses:
 *       200:
 *         description: Luggage confirmed as STORED
 * 
 * /api/v1/store/bookings/{booking_id}/verify-return-otp:
 *   post:
 *     summary: Verify Return OTP when Handing Over Luggage to Return Driver
 *     tags:
 *       - Store Bookings
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
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Return OTP verified, luggage handed over to return driver
 */