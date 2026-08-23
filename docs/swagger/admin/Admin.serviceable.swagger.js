/**
 * @swagger
 * /api/v1/admin/serviceable:
 *   get:
 *     summary: List Serviceable Areas
 *     tags:
 *       - Admin Serviceable Areas
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
 *     responses:
 *       200:
 *         description: List of serviceable areas
 *   post:
 *     summary: Create Serviceable Area
 *     tags:
 *       - Admin Serviceable Areas
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
 *               - center
 *               - service_radius_km
 *             properties:
 *               name:
 *                 type: string
 *                 example: Mumbai Central Zone
 *               center:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                     example: [72.8284, 19.2286]
 *               service_radius_km:
 *                 type: number
 *                 example: 5
 *     responses:
 *       201:
 *         description: Serviceable area created
 * 
 * /api/v1/admin/serviceable/check-serviceability:
 *   get:
 *     summary: Check Serviceability for Coordinates
 *     tags:
 *       - Admin Serviceable Areas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Serviceability check result
 * 
 * /api/v1/admin/serviceable/distance:
 *   get:
 *     summary: Calculate Distance Between Two Locations
 *     tags:
 *       - Admin Serviceable Areas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from_lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: from_lng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: to_lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: to_lng
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Distance in km
 * 
 * /api/v1/admin/serviceable/{id}:
 *   get:
 *     summary: Get Serviceable Area Details
 *     tags:
 *       - Admin Serviceable Areas
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
 *         description: Serviceable area details
 *   put:
 *     summary: Update Serviceable Area
 *     tags:
 *       - Admin Serviceable Areas
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
 *               service_radius_km:
 *                 type: number
 *     responses:
 *       200:
 *         description: Area updated
 *   delete:
 *     summary: Delete Serviceable Area
 *     tags:
 *       - Admin Serviceable Areas
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
 *         description: Area deleted
 * 
 * /api/v1/admin/serviceable/{id}/status:
 *   patch:
 *     summary: Toggle Serviceable Area Active Status
 *     tags:
 *       - Admin Serviceable Areas
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
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status updated
 */
