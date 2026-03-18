/**
 * @swagger
 *   /api/v1/user/auth/login:
 *     post:
 *       summary: User Signup/Login
 *       tags:
 *         - Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phone:
 *                   type: string
 *                   example: 8085984844
 *               required:
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/user/auth/resend-otp:
 *     post:
 *       summary: Re Send OTP
 *       tags:
 *         - Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phone:
 *                   type: string
 *                   example: 8085984844
 *               required:
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/user/auth/verify-otp:
 *     post:
 *       summary: Verify OTP
 *       tags:
 *         - Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phone:
 *                   type: string
 *                   example: 8085984844
 *                 otp:
 *                   type: string
 *                   example: 4320
 *               required:
 *                 - phone
 *                 - otp
 */

/**
 * @swagger
 *   /api/v1/user/auth/refresh:
 *     post:
 *       summary: Refresh Token
 *       tags:
 *         - Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/auth/complete-profile:
 *     put:
 *       summary: User Complete Profile
 *       tags:
 *         - Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 first_name:
 *                   type: string
 *                   example: Sidu
 *                 last_name:
 *                   type: string
 *                   example: Sharma
 *                 gender:
 *                   type: string
 *                   example: male
 *                 email:
 *                   type: string
 *                   example: hi@gmail.com
 *                 dob:
 *                   type: string
 *                   example: "2001-01-01"
 *                 address:
 *                   type: string
 *                   example: Xyz place
 *                 lat:
 *                   type: number
 *                   example: 10.458
 *                 lng:
 *                   type: number
 *                   example: 10.458
 *               required:
 *                 - first_name
 *                 - last_name
 *                 - gender
 *                 - email
 *                 - dob
 *                 - address
 *                 - lat
 *                 - lng
 */

/**
 * @swagger
 *   /api/v1/user/auth/logout:
 *     post:
 *       summary: Logout
 *       tags:
 *         - Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 */