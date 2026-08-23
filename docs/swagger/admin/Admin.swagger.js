/**
 * @swagger
 * /api/v1/admin/profile:
 *   get:
 *     summary: Get Admin Profile
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile details returned
 *   put:
 *     summary: Update Admin Profile
 *     tags:
 *       - Admin Management
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
 *                 example: Admin Name
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE, OTHER]
 *                 example: MALE
 *     responses:
 *       200:
 *         description: Profile updated
 * 
 * /api/v1/admin/team:
 *   get:
 *     summary: Get Admin Team Members List
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team members returned
 * 
 * /api/v1/admin/team/{id}:
 *   get:
 *     summary: Get Admin Team Member by ID
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team member details
 *   put:
 *     summary: Update Admin Team Member Details
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               gender:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member updated
 * 
 * /api/v1/admin/bulk-delete:
 *   delete:
 *     summary: Bulk Deactivate Admin Members
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Accounts deactivated
 * 
 * /api/v1/admin/invite:
 *   post:
 *     summary: Send Admin Invite
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 example: newstaff@holdit.com
 *               role:
 *                 type: string
 *                 enum: [ADMIN, OPERATION_MANAGER, CUSTOMER_SUPPORT]
 *                 example: OPERATION_MANAGER
 *     responses:
 *       200:
 *         description: Invite sent
 * 
 * /api/v1/admin/resend-invite/{id}:
 *   put:
 *     summary: Resend Admin Invite
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invite resent
 * 
 * /api/v1/admin/account-status/{id}:
 *   put:
 *     summary: Update Admin Account Status
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - account_status
 *             properties:
 *               account_status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, BLOCKED]
 *                 example: ACTIVE
 *     responses:
 *       200:
 *         description: Account status updated
 */