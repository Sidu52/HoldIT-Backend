/**
 * @swagger
 * /api/v1/admin/driver/bulk-delete:
 *   delete:
 *     summary: Bulk Deactivate Drivers
 *     tags:
 *       - Admin Drivers
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
 *         description: Drivers deactivated
 * 
 * /api/v1/admin/driver:
 *   get:
 *     summary: List All Drivers
 *     tags:
 *       - Admin Drivers
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
 *         description: List of driver accounts
 * 
 * /api/v1/admin/driver/{driver_id}:
 *   get:
 *     summary: Get Driver Details by ID
 *     tags:
 *       - Admin Drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driver_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver profile details
 *   patch:
 *     summary: Update Driver Info
 *     tags:
 *       - Admin Drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driver_id
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
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver details updated
 * 
 * /api/v1/admin/driver/{driver_id}/location:
 *   patch:
 *     summary: Update Driver Location Manually
 *     tags:
 *       - Admin Drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driver_id
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
 *         description: Location updated
 * 
 * /api/v1/admin/driver/{driver_id}/status:
 *   patch:
 *     summary: Update Driver Account Status
 *     tags:
 *       - Admin Drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driver_id
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
 *                 enum: [ACTIVE, PENDING, INACTIVE, BLOCKED]
 *     responses:
 *       200:
 *         description: Status updated
 * 
 * /api/v1/admin/driver/{driver_id}/duty:
 *   patch:
 *     summary: Toggle Driver Duty (Online/Offline)
 *     tags:
 *       - Admin Drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driver_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Duty status toggled
 */