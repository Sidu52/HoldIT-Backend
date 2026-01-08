/**
 * @swagger
 * tags:
 *   name: Admin Auth
 *   description: Admin authentication APIs
 */

/**
 * @swagger
 * /admin/auth/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@gmail.com
 *               password:
 *                 type: string
 *                 example: Admin@123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */

/**
 * @swagger
 * /admin/auth/signup:
 *   post:
 *     summary: Admin signup
 *     tags: [Admin Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Admin created
 */

/**
 * @swagger
 * /admin/auth/verify-invite:
 *   get:
 *     summary: Verify admin invite token
 *     tags: [Admin Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token valid
 */

/**
 * @swagger
 * /admin/auth/forgot-password:
 *   post:
 *     summary: Create forgot password token
 *     tags: [Admin Auth]
 *     responses:
 *       200:
 *         description: Reset link sent
 */

/**
 * @swagger
 * /admin/auth/reset-password:
 *   post:
 *     summary: Reset password (public)
 *     tags: [Admin Auth]
 *     responses:
 *       200:
 *         description: Password reset successful
 */

/**
 * @swagger
 * /admin/auth/verify:
 *   get:
 *     summary: Verify admin token
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin is valid
 */

/**
 * @swagger
 * /admin/auth/logout:
 *   post:
 *     summary: Admin logout
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */

/**
 * @swagger
 * /admin/auth/reset-password:
 *   put:
 *     summary: Update password (protected)
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Password updated
 */
