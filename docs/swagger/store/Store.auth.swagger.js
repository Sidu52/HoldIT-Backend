/**
 * @swagger
 * /api/v1/store/auth/login:
 *   post:
 *     summary: Store Staff Login / Request OTP
 *     tags:
 *       - Store Auth
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
 *         description: OTP sent to store phone
 * 
 * /api/v1/store/auth/resend:
 *   post:
 *     summary: Resend OTP to Store Phone
 *     tags:
 *       - Store Auth
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
 * /api/v1/store/auth/verify:
 *   post:
 *     summary: Verify OTP & Authenticate Store Staff
 *     tags:
 *       - Store Auth
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
 *         description: Store authenticated, returns JWT token
 * 
 * /api/v1/store/auth/refresh:
 *   post:
 *     summary: Refresh Store Access Token
 *     tags:
 *       - Store Auth
 *     responses:
 *       200:
 *         description: New access token issued
 * 
 * /api/v1/store/auth/logout:
 *   post:
 *     summary: Store Staff Logout
 *     tags:
 *       - Store Auth
 *     responses:
 *       200:
 *         description: Logged out successfully
 */