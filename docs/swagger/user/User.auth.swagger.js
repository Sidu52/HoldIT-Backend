/**
 * @swagger
 * /api/v1/user/auth/login:
 *   post:
 *     summary: User Login / Send OTP
 *     tags:
 *       - User Auth
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
 *         description: OTP sent to phone number
 * 
 * /api/v1/user/auth/resend-otp:
 *   post:
 *     summary: Resend OTP to User Phone
 *     tags:
 *       - User Auth
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
 * /api/v1/user/auth/verify-otp:
 *   post:
 *     summary: Verify OTP & Authenticate User
 *     tags:
 *       - User Auth
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
 *         description: OTP verified, returns JWT tokens
 * 
 * /api/v1/user/auth/refresh:
 *   post:
 *     summary: Refresh User Access Token
 *     tags:
 *       - User Auth
 *     responses:
 *       200:
 *         description: New access token issued
 * 
 * /api/v1/user/auth/complete-profile:
 *   put:
 *     summary: Complete New User Profile Details
 *     tags:
 *       - User Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Siddhant
 *               lastName:
 *                 type: string
 *                 example: Sharma
 *               email:
 *                 type: string
 *                 example: user@gmail.com
 *     responses:
 *       200:
 *         description: Profile details updated
 * 
 * /api/v1/user/auth/logout:
 *   post:
 *     summary: User Logout
 *     tags:
 *       - User Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */