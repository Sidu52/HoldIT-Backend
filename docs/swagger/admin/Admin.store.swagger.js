/**
 * @swagger
 *   /api/v1/admin/stores:
 *     get:
 *       summary: Get All Stores
 *       tags:
 *         - Store
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
 *   /api/v1/admin/stores:
 *     post:
 *       summary: Create Store
 *       tags:
 *         - Store
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
 *                   example: 1234567898
 *                 store_name:
 *                   type: string
 *                   example: Mumbai Central Luggage Hub
 *                 lat:
 *                   type: number
 *                   example: 19.076
 *                 lng:
 *                   type: number
 *                   example: 72.8777
 *                 address:
 *                   type: string
 *                   example: Platform 1, CST Station, Mumbai 400001
 *                 store_description:
 *                   type: string
 *                   example: Secure luggage storage near CST.
 *                 store_open_time:
 *                   type: string
 *                   example: "07:00"
 *                 store_close_time:
 *                   type: string
 *                   example: "23:00"
 *                 store_contact_number:
 *                   type: string
 *                   example: 9876543210
 *                 max_booking_capacity:
 *                   type: number
 *                   example: 80
 *                 store_owner_id:
 *                   type: string
 *                   example: 69633722ab729be239a689c2
 *               required:
 *                 - phone
 *                 - store_name
 *                 - lat
 *                 - lng
 *                 - address
 *                 - store_description
 *                 - store_open_time
 *                 - store_close_time
 *                 - store_contact_number
 *                 - max_booking_capacity
 *                 - store_owner_id
 */

/**
 * @swagger
 *   /api/v1/admin/stores/:store_id:
 *     get:
 *       summary: Store By ID
 *       tags:
 *         - Store
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
 *   /api/v1/admin/stores/:store_id:
 *     put:
 *       summary: Update Store
 *       tags:
 *         - Store
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
 *                 store_name:
 *                   type: string
 *                   example: Downtown Storage Hub
 *                 max_booking_capacity:
 *                   type: number
 *                   example: 100
 *                 store_open_time:
 *                   type: string
 *                   example: "08:00"
 *                 store_close_time:
 *                   type: string
 *                   example: "22:00"
 *                 store_contact_number:
 *                   type: string
 *                   example: 9876543210
 *                 store_description:
 *                   type: string
 *                   example: Secure luggage storage in the heart of downtown.
 *                 lat:
 *                   type: number
 *                   example: 19.076
 *                 lng:
 *                   type: number
 *                   example: 72.8777
 *                 address:
 *                   type: string
 *                   example: 123 Main Street, Mumbai, Maharashtra 400001
 *               required:
 *                 - store_name
 *                 - max_booking_capacity
 *                 - store_open_time
 *                 - store_close_time
 *                 - store_contact_number
 *                 - store_description
 *                 - lat
 *                 - lng
 *                 - address
 */

/**
 * @swagger
 *   /api/v1/admin/stores/:store_id/status:
 *     patch:
 *       summary: Update Store Status
 *       tags:
 *         - Store
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
 *   /api/v1/admin/stores/:store_id/verification:
 *     patch:
 *       summary: Store Verification
 *       tags:
 *         - Store
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
 *                 verification_status:
 *                   type: string
 *                   example: verified
 *               required:
 *                 - verification_status
 */

/**
 * @swagger
 *   /api/v1/admin/stores/:store_id/duty:
 *     patch:
 *       summary: Store Online/Offline
 *       tags:
 *         - Store
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
 *                 is_online:
 *                   type: boolean
 *                   example: true
 *               required:
 *                 - is_online
 */