/**
 * @swagger
 * /api/v1/admin/storeowner:
 *   get:
 *     summary: List Store Owners
 *     tags:
 *       - Admin Store Owners
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
 *     responses:
 *       200:
 *         description: Store owners list
 *   post:
 *     summary: Create Store Owner
 *     tags:
 *       - Admin Store Owners
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Store owner created
 * 
 * /api/v1/admin/storeowner/bulk-delete:
 *   delete:
 *     summary: Bulk Deactivate Store Owners
 *     tags:
 *       - Admin Store Owners
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
 *         description: Store owners deactivated
 * 
 * /api/v1/admin/storeowner/{store_owner_id}:
 *   get:
 *     summary: Get Store Owner Details by ID
 *     tags:
 *       - Admin Store Owners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_owner_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store owner details
 *   put:
 *     summary: Update Store Owner Details
 *     tags:
 *       - Admin Store Owners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_owner_id
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
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Store owner updated
 * 
 * /api/v1/admin/storeowner/{store_owner_id}/status:
 *   patch:
 *     summary: Update Store Owner Account Status
 *     tags:
 *       - Admin Store Owners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_owner_id
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
 *     responses:
 *       200:
 *         description: Status updated
 */