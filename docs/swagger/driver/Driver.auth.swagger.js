/**
 * @swagger
 *   /api/v1/driver/auth/login:
 *     post:
 *       summary: Driver Login/Signup
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
 *                   example: 9000000003
 *               required:
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/driver/auth/resend-otp:
 *     post:
 *       summary: Resend OTP
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
 *                   example: 9000000003
 *               required:
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/driver/auth/verify-otp:
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
 *                   example: 9000000003
 *                 otp:
 *                   type: string
 *                   example: 1847
 *               required:
 *                 - phone
 *                 - otp
 */

/**
 * @swagger
 *   /api/v1/driver/auth/refresh:
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
 *   /api/v1/driver/auth/complete-profile:
 *     put:
 *       summary: Driver Complete Profile
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
 *                   example: SS
 *                 verification_status:
 *                   type: string
 *                   example: verified
 *               required:
 *                 - first_name
 *                 - verification_status
 */

/**
 * @swagger
 *   /api/v1/driver/auth/logout:
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