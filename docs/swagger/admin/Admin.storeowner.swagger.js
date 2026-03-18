/**
 * @swagger
 *   /api/v1/admin/storeowner:
 *     get:
 *       summary: Get All Store Owners
 *       tags:
 *         - Store Owner
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
 *   /api/v1/admin/storeowner:
 *     post:
 *       summary: Create Store Owner
 *       tags:
 *         - Store Owner
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
 *                   example: Rahul
 *                 last_name:
 *                   type: string
 *                   example: Sharma
 *                 email:
 *                   type: string
 *                   example: rahul.sharma@example.com
 *                 phone:
 *                   type: string
 *                   example: +919876543210
 *                 gender:
 *                   type: string
 *                   example: male
 *                 date_of_birth:
 *                   type: string
 *                   example: "1995-06-15"
 *                 address:
 *                   type: string
 *                   example: 123 MG Road, Mumbai, Maharashtra
 *               required:
 *                 - first_name
 *                 - last_name
 *                 - email
 *                 - phone
 *                 - gender
 *                 - date_of_birth
 *                 - address
 */

/**
 * @swagger
 *   /api/v1/admin/storeowner/:store_owner_id:
 *     get:
 *       summary: Store Owner By ID
 *       tags:
 *         - Store Owner
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
 *   /api/v1/admin/storeowner/:store_owner_id:
 *     put:
 *       summary: Update Store Owner
 *       tags:
 *         - Store Owner
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
 *                   example: Rahul
 *                 last_name:
 *                   type: string
 *                   example: Sharma
 *                 email:
 *                   type: string
 *                   example: rahul.sharma@example.com
 *                 phone:
 *                   type: string
 *                   example: +919876543210
 *                 gender:
 *                   type: string
 *                   example: male
 *                 date_of_birth:
 *                   type: string
 *                   example: "1995-06-15"
 *                 address:
 *                   type: string
 *                   example: 123 MG Road, Mumbai, Maharashtra
 *               required:
 *                 - first_name
 *                 - last_name
 *                 - email
 *                 - phone
 *                 - gender
 *                 - date_of_birth
 *                 - address
 */

/**
 * @swagger
 *   /api/v1/admin/storeowner/:store_owner_id/status:
 *     patch:
 *       summary: Update Store Owner Status
 *       tags:
 *         - Store Owner
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
 *                 status:
 *                   type: string
 *                   example: active
 *               required:
 *                 - status
 */