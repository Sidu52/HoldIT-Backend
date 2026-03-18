/**
 * @swagger
 *   /api/v1/admin/user:
 *     get:
 *       summary: Get All Users
 *       tags:
 *         - User
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
 *   /api/v1/admin/user/:user_id:
 *     get:
 *       summary: User By ID
 *       tags:
 *         - User
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
 *   /api/v1/admin/user/:user_id:
 *     put:
 *       summary: Update User Profile
 *       tags:
 *         - User
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
 *                 first_name:
 *                   type: string
 *                   example: Sidhu
 *                 last_name:
 *                   type: string
 *                   example: Sharma
 *                 gender:
 *                   type: string
 *                   example: male
 *                 email:
 *                   type: string
 *                   example: ss@gmail.com
 *                 phone:
 *                   type: number
 *                   example: 1234567890
 *               required:
 *                 - first_name
 *                 - last_name
 *                 - gender
 *                 - email
 *                 - phone
 */

/**
 * @swagger
 *   /api/v1/admin/user/:user_id/status:
 *     patch:
 *       summary: Update User Status
 *       tags:
 *         - User
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
 *                 is_active:
 *                   type: boolean
 *                   example: true
 *               required:
 *                 - is_active
 */

/**
 * @swagger
 *   /api/v1/admin/user/bulk-deactivate:
 *     post:
 *       summary: Bulk Deactivate Users
 *       tags:
 *         - User
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
 *                 ids:
 *                   type: array
 *                   items:
 *                     type: string
 *                 reason:
 *                   type: string
 *                   example: fraud
 *               required:
 *                 - ids
 *                 - reason
 */