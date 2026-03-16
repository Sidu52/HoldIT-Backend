/**
 * @swagger
 * tags:
 * - name: User Auth
 * description: User Auth operations
 */

/**
 * @swagger
 *   /api/v1/user/auth/login:
 *     post:
 *       summary: User Login and Signup
 *       tags:
 *         - User Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: OTP sent successfully
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T09:38:20.279Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - timestamp
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
 *
 */

/**
 * @swagger
 *   /api/v1/user/auth/resend-otp:
 *     post:
 *       summary: User Resend OTP
 *       tags:
 *         - User Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: OTP sent successfully
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T09:38:20.279Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - timestamp
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
 *
 */

/**
 * @swagger
 *   /api/v1/user/auth/verify-otp:
 *     post:
 *       summary: User Verify OTP
 *       tags:
 *         - User Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Login successful
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T09:41:00.482Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - timestamp
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
 *                   example: 1361
 *               required:
 *                 - phone
 *                 - otp
 *
 */

/**
 * @swagger
 *   /api/v1/user/auth/refresh:
 *     post:
 *       summary: Refresh Token
 *       tags:
 *         - User Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Token refreshed successfully
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T09:43:37.483Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 *
 */

/**
 * @swagger
 *   /api/v1/user/auth/complete-profile:
 *     put:
 *       summary: User Complete Profile
 *       tags:
 *         - User Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: false
 *                   status:
 *                     type: number
 *                     example: 409
 *                   message:
 *                     type: string
 *                     example: Profile already completed. Use profile update instead.
 *                   data:
 *                     type: object
 *                     nullable: true
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T09:46:23.415Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
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
 *
 */

/**
 * @swagger
 *   /api/v1/user/auth/logout:
 *     post:
 *       summary: User Complete Profile
 *       tags:
 *         - User Auth
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Logged out successfully
 *                   data:
 *                     type: object
 *                     nullable: true
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T10:12:47.990Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 *
 */

