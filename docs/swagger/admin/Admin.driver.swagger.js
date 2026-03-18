/**
 * @swagger
 *   /api/v1/admin/driver:
 *     get:
 *       summary: Get All Drivers
 *       tags:
 *         - Driver
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
 *   /api/v1/admin/driver/:driver_id:
 *     get:
 *       summary: Driver By Id
 *       tags:
 *         - Driver
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
 *   /api/v1/admin/driver/:driver_id:
 *     patch:
 *       summary: Update Driver
 *       tags:
 *         - Driver
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
 *                   example: rahul
 *               required:
 *                 - first_name
 */

/**
 * @swagger
 *   /api/v1/admin/driver/:driver_id/location:
 *     patch:
 *       summary: Update Driver Location
 *       tags:
 *         - Driver
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
 *                 lng:
 *                   type: number
 *                   example: 19.1367
 *                 lat:
 *                   type: number
 *                   example: 72.8295
 *               required:
 *                 - lng
 *                 - lat
 */

/**
 * @swagger
 *   /api/v1/admin/driver/:driver_id/account:
 *     patch:
 *       summary: Update Driver Account Status
 *       tags:
 *         - Driver
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
 *   /api/v1/admin/driver/bulk-deactivate:
 *     post:
 *       summary: Bulk Deactivate Drivers
 *       tags:
 *         - Driver
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
 *                   example: Resign from post
 *               required:
 *                 - ids
 *                 - reason
 */