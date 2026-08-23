/**
 * @swagger
 * /api/v1/driver/auth/login:
 *   post:
 *     summary: Driver Login / Request OTP
 *     tags:
 *       - Driver Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *     responses:
 *       200:
 *         description: OTP sent to driver phone
 * 
 * /api/v1/driver/auth/resend-otp:
 *   post:
 *     summary: Resend OTP to Driver Phone
 *     tags:
 *       - Driver Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *     responses:
 *       200:
 *         description: OTP resent
 * 
 * /api/v1/driver/auth/verify-otp:
 *   post:
 *     summary: Verify OTP & Authenticate Driver
 *     tags:
 *       - Driver Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Driver authenticated, returns JWT
 * 
 * /api/v1/driver/auth/refresh:
 *   post:
 *     summary: Refresh Driver Access Token
 *     tags:
 *       - Driver Auth
 *     responses:
 *       200:
 *         description: New access token issued
 * 
 * /api/v1/driver/auth/complete-profile:
 *   put:
 *     summary: Complete Driver Registration & Vehicle Details
 *     tags:
 *       - Driver Auth
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
 *               vehicleNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile completed
 * 
 * /api/v1/driver/auth/logout:
 *   post:
 *     summary: Driver Logout
 *     tags:
 *       - Driver Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */