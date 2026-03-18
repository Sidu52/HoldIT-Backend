/**
 * @swagger
 *   /api/v1/admin/invite:
 *     post:
 *       summary: Invite Admin
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
 *                 email:
 *                   type: string
 *                   example: ss1@gmail.com
 *                 role:
 *                   type: string
 *                   example: operation_manager
 *               required:
 *                 - email
 *                 - role
 */

/**
 * @swagger
 *   /api/v1/admin/auth/verify:
 *     get:
 *       summary: Verify Admin Invite Token
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
 */

/**
 * @swagger
 *   /api/v1/admin/auth/signup:
 *     post:
 *       summary: Admin Signup With Token
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
 *                 name:
 *                   type: string
 *                   example: Sidhu Als
 *                 password:
 *                   type: string
 *                   example: Sidhu&7879
 *                 gender:
 *                   type: string
 *                   example: MALE
 *               required:
 *                 - name
 *                 - password
 *                 - gender
 */

/**
 * @swagger
 *   /api/v1/admin/auth/login:
 *     post:
 *       summary: Admin Login
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
 *                 email:
 *                   type: string
 *                   example: hitechsidu992@gmail.com
 *                 password:
 *                   type: string
 *                   example: Sidhu&7879
 *               required:
 *                 - email
 *                 - password
 */

/**
 * @swagger
 *   /api/v1/admin/auth/logout:
 *     post:
 *       summary: Admin Logout
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
 */

/**
 * @swagger
 *   /api/v1/admin/auth/refresh:
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
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                   example: ss1@gmail.com
 *                 role:
 *                   type: string
 *                   example: operation_manager
 *               required:
 *                 - email
 *                 - role
 */

/**
 * @swagger
 *   /api/v1/admin/auth/verify:
 *     put:
 *       summary: Verify Users
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
 *                 email:
 *                   type: string
 *                   example: siddhantsharma9926@gmail.com
 *               required:
 *                 - email
 */