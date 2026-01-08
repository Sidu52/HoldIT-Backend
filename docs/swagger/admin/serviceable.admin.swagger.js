/**
 * @swagger
 * components:
 *   schemas:
 *     ServiceableArea:
 *       type: object
 *       required:
 *         - name
 *         - city
 *         - state
 *         - location
 *       properties:
 *         name:
 *           type: string
 *           example: Andheri West
 *         city:
 *           type: string
 *           example: Mumbai
 *         state:
 *           type: string
 *           example: Maharashtra
 *         pincode:
 *           type: string
 *           example: "400058"
 *         location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               example: Point
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               example: [72.8295, 19.1238]
 *         service_radius_km:
 *           type: number
 *           example: 5
 *         delivery_charge:
 *           type: number
 *           example: 30
 *         is_active:
 *           type: boolean
 *           example: true
 */

/**
 * @swagger
 * /admin/serviceable-area:
 *   post:
 *     summary: Create serviceable area
 *     tags: [Serviceable Area]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ServiceableArea'
 *     responses:
 *       201:
 *         description: Serviceable area created
 *       400:
 *         description: Bad request
 */

/**
 * @swagger
 * /admin/serviceable-area:
 *   get:
 *     summary: Get all serviceable areas
 *     tags: [Serviceable Area]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of serviceable areas
 */

/**
 * @swagger
 * /admin/serviceable-area/{id}:
 *   get:
 *     summary: Get serviceable area by ID
 *     tags: [Serviceable Area]
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
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /admin/serviceable-area/{id}:
 *   put:
 *     summary: Update serviceable area
 *     tags: [Serviceable Area]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ServiceableArea'
 *     responses:
 *       200:
 *         description: Updated successfully
 */

/**
 * @swagger
 * /admin/serviceable-area/{id}/status:
 *   patch:
 *     summary: Toggle serviceable area status
 *     tags: [Serviceable Area]
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
 *         description: Status updated
 */

/**
 * @swagger
 * /admin/serviceable-area/{id}:
 *   delete:
 *     summary: Delete serviceable area
 *     tags: [Serviceable Area]
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
 *         description: Deleted successfully
 */
