/**
 * @swagger
 * /api/v1/store-owner/auth/login:
 *   post:
 *     summary: Store Owner Login / Request OTP
 *     tags:
 *       - Store Owner Auth
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
 *         description: OTP sent to store owner phone
 * 
 * /api/v1/store-owner/auth/register:
 *   post:
 *     summary: Register New Store Owner Account / Request OTP
 *     tags:
 *       - Store Owner Auth
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
 *         description: Registration OTP sent
 * 
 * /api/v1/store-owner/auth/resend:
 *   post:
 *     summary: Resend OTP to Store Owner Phone
 *     tags:
 *       - Store Owner Auth
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
 * /api/v1/store-owner/auth/verify:
 *   post:
 *     summary: Verify OTP & Authenticate Store Owner
 *     tags:
 *       - Store Owner Auth
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
 *         description: Store owner authenticated, returns JWT token
 * 
 * /api/v1/store-owner/auth/refresh:
 *   post:
 *     summary: Refresh Store Owner Access Token
 *     tags:
 *       - Store Owner Auth
 *     responses:
 *       200:
 *         description: New access token issued
 * 
 * /api/v1/store-owner/auth/logout:
 *   post:
 *     summary: Store Owner Logout
 *     tags:
 *       - Store Owner Auth
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
