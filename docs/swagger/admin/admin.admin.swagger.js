/**
 * @swagger
 * tags:
 *   name: Admin Management
 *   description: Admin profile and management APIs
 */

/**
 * @swagger
 * /admin/admins/profile:
 *   get:
 *     summary: Get logged-in admin profile
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile fetched successfully
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /admin/admins/profile:
 *   put:
 *     summary: Update logged-in admin profile
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sidhu Admin
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */

/**
 * @swagger
 * /admin/admins/invite:
 *   post:
 *     summary: Invite new admin (Super Admin only)
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email:
 *                 type: string
 *                 example: newadmin@gmail.com
 *               role:
 *                 type: string
 *                 example: ADMIN
 *     responses:
 *       200:
 *         description: Admin invite sent successfully
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /admin/admins:
 *   get:
 *     summary: Get all admins
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin list fetched successfully
 */

/**
 * @swagger
 * /admin/admins/super:
 *   get:
 *     summary: Get all super admins
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Super admin list fetched successfully
 */

/**
 * @swagger
 * /admin/admins/account_status:
 *   put:
 *     summary: Update admin account status (Admin/Super Admin)
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adminId, isActive]
 *             properties:
 *               adminId:
 *                 type: string
 *                 example: 65ab12fe90c11a
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Account status updated
 *       403:
 *         description: Forbidden
 */
