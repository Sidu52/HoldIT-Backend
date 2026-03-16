/**
 * @swagger
 * tags:
 * - name: "User"
 * description: "User operations"
 */

/**
 * @swagger
 *   /api/v1/user/profile:
 *     put:
 *       summary: User Profile Update
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Profile updated successfully
 *                   data:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 696c879538ad2da77ca68d60
 *                       phone:
 *                         type: string
 *                         example: 0000000000
 *                       isSignUp:
 *                         type: boolean
 *                         example: true
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       account_deactivated_reason:
 *                         type: object
 *                         nullable: true
 *                       is_serviceable:
 *                         type: boolean
 *                         example: true
 *                       status:
 *                         type: string
 *                         example: active
 *                       createdAt:
 *                         type: string
 *                         example: "2026-01-18T07:11:17.025Z"
 *                       updatedAt:
 *                         type: string
 *                         example: "2026-03-12T10:31:45.981Z"
 *                       last_active_at:
 *                         type: string
 *                         example: "2026-03-12T09:43:37.482Z"
 *                       last_login_at:
 *                         type: string
 *                         example: "2026-03-12T09:41:00.443Z"
 *                       address:
 *                         type: string
 *                         example: Home
 *                       dob:
 *                         type: string
 *                         example: "2001-01-05T18:30:00.000Z"
 *                       email:
 *                         type: string
 *                         example: xyz@gmail.com
 *                       first_name:
 *                         type: string
 *                         example: Xyz
 *                       gender:
 *                         type: string
 *                         example: male
 *                       last_name:
 *                         type: string
 *                         example: xyz
 *                       service_area_id:
 *                         type: string
 *                         example: 695d574f87437745265ef6b3
 *                       location:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: Point
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                         required:
 *                           - type
 *                           - coordinates
 *                       isVerified:
 *                         type: boolean
 *                         example: true
 *                     required:
 *                       - _id
 *                       - phone
 *                       - isSignUp
 *                       - is_active
 *                       - account_deactivated_reason
 *                       - is_serviceable
 *                       - status
 *                       - createdAt
 *                       - updatedAt
 *                       - last_active_at
 *                       - last_login_at
 *                       - address
 *                       - dob
 *                       - email
 *                       - first_name
 *                       - gender
 *                       - last_name
 *                       - service_area_id
 *                       - location
 *                       - isVerified
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T10:31:46.289Z"
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
 *                   example: Xyz
 *                 last_name:
 *                   type: string
 *                   example: xyz
 *               required:
 *                 - first_name
 *                 - last_name
 */

/**
 * @swagger
 *   /api/v1/user/profile:
 *     get:
 *       summary: User Profile Detail
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Profile Fetch successfully
 *                   data:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 696c879538ad2da77ca68d60
 *                       phone:
 *                         type: string
 *                         example: 0000000000
 *                       isSignUp:
 *                         type: boolean
 *                         example: true
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       account_deactivated_reason:
 *                         type: object
 *                         nullable: true
 *                       is_serviceable:
 *                         type: boolean
 *                         example: true
 *                       status:
 *                         type: string
 *                         example: active
 *                       createdAt:
 *                         type: string
 *                         example: "2026-01-18T07:11:17.025Z"
 *                       updatedAt:
 *                         type: string
 *                         example: "2026-03-12T10:31:45.981Z"
 *                       last_active_at:
 *                         type: string
 *                         example: "2026-03-12T09:43:37.482Z"
 *                       last_login_at:
 *                         type: string
 *                         example: "2026-03-12T09:41:00.443Z"
 *                       address:
 *                         type: string
 *                         example: Home
 *                       dob:
 *                         type: string
 *                         example: "2001-01-05T18:30:00.000Z"
 *                       email:
 *                         type: string
 *                         example: xyz@gmail.com
 *                       first_name:
 *                         type: string
 *                         example: Xyz
 *                       gender:
 *                         type: string
 *                         example: male
 *                       last_name:
 *                         type: string
 *                         example: xyz
 *                       service_area_id:
 *                         type: string
 *                         example: 695d574f87437745265ef6b3
 *                       location:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: Point
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                         required:
 *                           - type
 *                           - coordinates
 *                       isVerified:
 *                         type: boolean
 *                         example: true
 *                     required:
 *                       - _id
 *                       - phone
 *                       - isSignUp
 *                       - is_active
 *                       - account_deactivated_reason
 *                       - is_serviceable
 *                       - status
 *                       - createdAt
 *                       - updatedAt
 *                       - last_active_at
 *                       - last_login_at
 *                       - address
 *                       - dob
 *                       - email
 *                       - first_name
 *                       - gender
 *                       - last_name
 *                       - service_area_id
 *                       - location
 *                       - isVerified
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T10:31:46.289Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/addresses:
 *     get:
 *       summary: Fetch User Addresses
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Addresses fetched successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       addresses:
 *                         type: array
 *                         items:
 *                           type: string
 *                       total:
 *                         type: number
 *                         example: 0
 *                     required:
 *                       - addresses
 *                       - total
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T10:45:33.219Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/addresses:
 *     post:
 *       summary: Add User Address
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 201
 *                   message:
 *                     type: string
 *                     example: Address added successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       address:
 *                         type: object
 *                         properties:
 *                           street:
 *                             type: string
 *                             example: SS Schoool
 *                           city:
 *                             type: string
 *                             example: Mumbai
 *                           state:
 *                             type: string
 *                             example: Maharastra
 *                           postal_code:
 *                             type: string
 *                             example: 0000000
 *                           country:
 *                             type: string
 *                             example: India
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           is_serviceable:
 *                             type: boolean
 *                             example: false
 *                           is_default:
 *                             type: boolean
 *                             example: false
 *                           _id:
 *                             type: string
 *                             example: 69b2a15ee9188bf081383c48
 *                         required:
 *                           - street
 *                           - city
 *                           - state
 *                           - postal_code
 *                           - country
 *                           - coordinates
 *                           - is_serviceable
 *                           - is_default
 *                           - _id
 *                       total_addresses:
 *                         type: number
 *                         example: 2
 *                     required:
 *                       - address
 *                       - total_addresses
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T11:19:58.995Z"
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
 *       summary: Fetch User Address By Id
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Addresses fetched successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       street:
 *                         type: string
 *                         example: SS Schoool
 *                       city:
 *                         type: string
 *                         example: Mumbai
 *                       state:
 *                         type: string
 *                         example: Maharastra
 *                       postal_code:
 *                         type: string
 *                         example: 0000000
 *                       country:
 *                         type: string
 *                         example: India
 *                       coordinates:
 *                         type: array
 *                         items:
 *                           type: number
 *                       is_serviceable:
 *                         type: boolean
 *                         example: false
 *                       is_default:
 *                         type: boolean
 *                         example: false
 *                       _id:
 *                         type: string
 *                         example: 69b2a15ee9188bf081383c48
 *                     required:
 *                       - street
 *                       - city
 *                       - state
 *                       - postal_code
 *                       - country
 *                       - coordinates
 *                       - is_serviceable
 *                       - is_default
 *                       - _id
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T11:26:27.453Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/address/:id:
 *     put:
 *       summary: Update User Address By Id
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Address updated successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       address:
 *                         type: object
 *                         properties:
 *                           street:
 *                             type: string
 *                             example: SS Schoool
 *                           city:
 *                             type: string
 *                             example: Mumbai
 *                           state:
 *                             type: string
 *                             example: Maharastra
 *                           postal_code:
 *                             type: string
 *                             example: 0000000
 *                           country:
 *                             type: string
 *                             example: India
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           is_serviceable:
 *                             type: boolean
 *                             example: false
 *                           is_default:
 *                             type: boolean
 *                             example: false
 *                           _id:
 *                             type: string
 *                             example: 69b2a15ee9188bf081383c48
 *                         required:
 *                           - street
 *                           - city
 *                           - state
 *                           - postal_code
 *                           - country
 *                           - coordinates
 *                           - is_serviceable
 *                           - is_default
 *                           - _id
 *                     required:
 *                       - address
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T11:33:26.466Z"
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
 *       summary: Delete User Address By Id
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
 *                   success:
 *                     type: boolean
 *                     example: true
 *                   status:
 *                     type: number
 *                     example: 200
 *                   message:
 *                     type: string
 *                     example: Address deleted successfully.
 *                   data:
 *                     type: object
 *                     properties:
 *                       remaining_addresses:
 *                         type: number
 *                         example: 1
 *                       new_default_index:
 *                         type: object
 *                         nullable: true
 *                     required:
 *                       - remaining_addresses
 *                       - new_default_index
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T11:38:19.934Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/stores/nearest?lat=25.2565485&lng=17.55552588&max_distance=40000:
 *     get:
 *       summary: Get Nearest Stores
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
 *                   success:
 *                     type: boolean
 *                     example: false
 *                   status:
 *                     type: number
 *                     example: 404
 *                   message:
 *                     type: string
 *                     example: No stores found near your location
 *                   data:
 *                     type: object
 *                     nullable: true
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T12:20:41.475Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

/**
 * @swagger
 *   /api/v1/user/stores/:id:
 *     get:
 *       summary: Get Nearest Stores
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
 *                   success:
 *                     type: boolean
 *                     example: false
 *                   status:
 *                     type: number
 *                     example: 404
 *                   message:
 *                     type: string
 *                     example: Store not found
 *                   data:
 *                     type: object
 *                     nullable: true
 *                   timestamp:
 *                     type: string
 *                     example: "2026-03-12T12:28:11.725Z"
 *                 required:
 *                   - success
 *                   - status
 *                   - message
 *                   - data
 *                   - timestamp
 *       security:
 *         - bearerAuth:
 */

