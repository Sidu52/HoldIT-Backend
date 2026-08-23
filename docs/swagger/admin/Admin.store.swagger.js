/**
 * @swagger
 * /api/v1/admin/store:
 *   get:
 *     summary: List All Stores
 *     tags:
 *       - Admin Stores
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
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of stores
 *   post:
 *     summary: Create New Store
 *     tags:
 *       - Admin Stores
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
 *               - address
 *               - location
 *               - totalCapacity
 *             properties:
 *               name:
 *                 type: string
 *                 example: Store One
 *               address:
 *                 type: string
 *                 example: 123 Main St
 *               location:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                     example: [72.8777, 19.0760]
 *               totalCapacity:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       201:
 *         description: Store created
 * 
 * /api/v1/admin/store/bulk-delete:
 *   delete:
 *     summary: Bulk Deactivate Stores
 *     tags:
 *       - Admin Stores
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
 *         description: Stores deactivated
 * 
 * /api/v1/admin/store/{store_id}:
 *   get:
 *     summary: Get Store Details by ID
 *     tags:
 *       - Admin Stores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store details
 *   put:
 *     summary: Update Store Details
 *     tags:
 *       - Admin Stores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
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
 *               totalCapacity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Store updated
 * 
 * /api/v1/admin/store/{store_id}/duty:
 *   patch:
 *     summary: Update Store Online/Offline Duty Status
 *     tags:
 *       - Admin Stores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
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
 *               - is_online
 *             properties:
 *               is_online:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Online status updated
 * 
 * /api/v1/admin/store/{store_id}/status:
 *   patch:
 *     summary: Update Store Account Status
 *     tags:
 *       - Admin Stores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, BLOCKED]
 *     responses:
 *       200:
 *         description: Status updated
 * 
 * /api/v1/admin/store/{store_id}/location:
 *   patch:
 *     summary: Update Store Coordinates
 *     tags:
 *       - Admin Stores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
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
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Store location updated
 */