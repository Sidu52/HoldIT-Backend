/**
 * @swagger
 * /api/v1/admin/auth/login:
 *   post:
 *     summary: Admin Login
 *     tags:
 *       - Admin Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@holdit.com
 *               password:
 *                 type: string
 *                 example: Admin@12345
 *     responses:
 *       200:
 *         description: Login successful, returns access token
 *       400:
 *         description: Invalid credentials
 * 
 * /api/v1/admin/auth/signup:
 *   post:
 *     summary: Admin Signup via Invite Token
 *     tags:
 *       - Admin Auth
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token sent via email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - password
 *               - gender
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Admin
 *               password:
 *                 type: string
 *                 example: Admin@12345
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE, OTHER]
 *                 example: MALE
 *     responses:
 *       200:
 *         description: Admin account created successfully
 * 
 * /api/v1/admin/auth/verify-invite:
 *   get:
 *     summary: Verify Admin Invite Token
 *     tags:
 *       - Admin Auth
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invite token is valid
 * 
 * /api/v1/admin/auth/refresh:
 *   post:
 *     summary: Refresh Admin Access Token
 *     tags:
 *       - Admin Auth
 *     responses:
 *       200:
 *         description: New access token issued
 * 
 * /api/v1/admin/auth/forgot-password:
 *   post:
 *     summary: Request Password Reset Email
 *     tags:
 *       - Admin Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@holdit.com
 *     responses:
 *       200:
 *         description: Password reset email sent
 * 
 * /api/v1/admin/auth/reset-password:
 *   get:
 *     summary: Verify Password Reset Token
 *     tags:
 *       - Admin Auth
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token is valid
 * 
 * /api/v1/admin/auth/forgot-password/reset:
 *   post:
 *     summary: Set New Password via Reset Token
 *     tags:
 *       - Admin Auth
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - confirmPassword
 *             properties:
 *               password:
 *                 type: string
 *                 example: NewAdminPass@123
 *               confirmPassword:
 *                 type: string
 *                 example: NewAdminPass@123
 *     responses:
 *       200:
 *         description: Password updated successfully
 * 
 * /api/v1/admin/auth/verify:
 *   get:
 *     summary: Verify Current Admin Session
 *     tags:
 *       - Admin Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session is valid
 * 
 * /api/v1/admin/auth/logout:
 *   post:
 *     summary: Admin Logout
 *     tags:
 *       - Admin Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 * 
 * /api/v1/admin/auth/change-password:
 *   put:
 *     summary: Change Admin Password
 *     tags:
 *       - Admin Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: OldPass@123
 *               newPassword:
 *                 type: string
 *                 example: NewPass@123
 *               confirmPassword:
 *                 type: string
 *                 example: NewPass@123
 *     responses:
 *       200:
 *         description: Password changed successfully
 */