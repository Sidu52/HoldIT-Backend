/**
 * @swagger
 *   /api/v1/admin/profile:
 *     get:
 *       summary: Profile
 *       tags:
 *         - Admin
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
 *   /api/v1/admin/profile:
 *     put:
 *       summary: Update Profile
 *       tags:
 *         - Admin
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
 *                   example: Sidhu
 *               required:
 *                 - first_name
 */

/**
 * @swagger
 *   /api/v1/admin/team:
 *     get:
 *       summary: Get All Team Members
 *       tags:
 *         - Admin
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
 *   /api/v1/admin/admins:
 *     get:
 *       summary: Fetch Admins
 *       tags:
 *         - Admin
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
 *   /api/v1/admin/super-admins:
 *     get:
 *       summary: Fetch Super Admins
 *       tags:
 *         - Admin
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
 *   /api/v1/admin/account-status:
 *     put:
 *       summary: Update Account Status
 *       tags:
 *         - Admin
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
 *                 auth_id:
 *                   type: string
 *                   example: 69631a69478b39509abeb2b7
 *                 status:
 *                   type: string
 *                   example: active
 *                 reason:
 *                   type: string
 *                   example: Verified Manually
 *               required:
 *                 - auth_id
 *                 - status
 *                 - reason
 */

/**
 * @swagger
 *   /api/v1/admin/dashboard/summary:
 *     get:
 *       summary: Dashboard Summary
 *       tags:
 *         - Admin
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
 *   /api/v1/admin/dashboard/chart:
 *     get:
 *       summary: Dashboard Chart
 *       tags:
 *         - Admin
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