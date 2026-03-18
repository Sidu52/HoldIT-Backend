/**
 * @swagger
 *   /api/v1/user/profile:
 *     get:
 *       summary: Profile
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
 *   /api/v1/user/profile:
 *     put:
 *       summary: Update Profile
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
 *                 coordinates:
 *                   type: array
 *                   items:
 *                     type: number
 *               required:
 *                 - coordinates
 */

/**
 * @swagger
 *   /api/v1/user/location:
 *     put:
 *       summary: Update Location
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
 *                 lat:
 *                   type: number
 *                   example: 19.1367
 *                 lng:
 *                   type: number
 *                   example: 72.8295
 *               required:
 *                 - lat
 *                 - lng
 */

/**
 * @swagger
 *   /api/v1/user/addresses:
 *     get:
 *       summary: User Addresses
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
 *   /api/v1/user/addresses:
 *     post:
 *       summary: Add Address
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
 *                 street:
 *                   type: string
 *                   example: SS Schoool
 *                 city:
 *                   type: string
 *                   example: Mumbai
 *                 state:
 *                   type: string
 *                   example: Maharastra
 *                 postal_code:
 *                   type: string
 *                   example: 0000000
 *                 country:
 *                   type: string
 *                   example: India
 *                 coordinates:
 *                   type: array
 *                   items:
 *                     type: number
 *                 is_default:
 *                   type: boolean
 *                   example: false
 *               required:
 *                 - street
 *                 - city
 *                 - state
 *                 - postal_code
 *                 - country
 *                 - coordinates
 *                 - is_default
 */

/**
 * @swagger
 *   /api/v1/user/address/:id:
 *     get:
 *       summary: User Addresses By Id
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
 *   /api/v1/user/address/:id:
 *     put:
 *       summary: Update Addresses By Id
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
 *                 city:
 *                   type: string
 *                   example: Mumbai
 *               required:
 *                 - city
 */

/**
 * @swagger
 *   /api/v1/user/address/:id:
 *     delete:
 *       summary: Delete Addresses By Id
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
 *   /api/v1/user/stores/nearest:
 *     get:
 *       summary: Nearest Stores
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
 *   /api/v1/user/stores/:id:
 *     get:
 *       summary: Stores By ID
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