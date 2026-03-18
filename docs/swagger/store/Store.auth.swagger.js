/**
 * @swagger
 *   /api/v1/store/auth:
 *     post:
 *       summary: Store SignUp/Login
 *       tags:
 *         - Store Auth
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
 *                   example: 9999999991
 *               required:
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/store/auth/resend:
 *     post:
 *       summary: Resend OTP
 *       tags:
 *         - Store Auth
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
 *                   example: 9999999991
 *               required:
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/store/auth/verify:
 *     post:
 *       summary: Verify OTP
 *       tags:
 *         - Store Auth
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
 *                   example: 9999999991
 *                 otp:
 *                   type: string
 *                   example: 5338
 *               required:
 *                 - phone
 *                 - otp
 */

/**
 * @swagger
 *   /api/v1/store/auth/refresh:
 *     post:
 *       summary: Refresh Token
 *       tags:
 *         - Store Auth
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
 *   /api/v1/store/auth/logout:
 *     post:
 *       summary: Logout
 *       tags:
 *         - Store Auth
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