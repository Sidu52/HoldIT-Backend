/**
 * @swagger
 * /api/v1/admin/price-rule:
 *   get:
 *     summary: List Price Rules
 *     tags:
 *       - Admin Price Rules
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
 *         description: Price rules list
 *   post:
 *     summary: Create Price Rule
 *     tags:
 *       - Admin Price Rules
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serviceAreaId
 *               - basePrice
 *             properties:
 *               serviceAreaId:
 *                 type: string
 *               basePrice:
 *                 type: number
 *     responses:
 *       201:
 *         description: Price rule created
 * 
 * /api/v1/admin/price-rule/service-area/{serviceAreaId}:
 *   get:
 *     summary: Get Active Price Rule for Service Area
 *     tags:
 *       - Admin Price Rules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serviceAreaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active price rule details
 * 
 * /api/v1/admin/price-rule/{id}:
 *   get:
 *     summary: Get Price Rule by ID
 *     tags:
 *       - Admin Price Rules
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
 *         description: Price rule details
 *   put:
 *     summary: Update Price Rule
 *     tags:
 *       - Admin Price Rules
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
 *               basePrice:
 *                 type: number
 *     responses:
 *       200:
 *         description: Price rule updated
 *   delete:
 *     summary: Delete Price Rule
 *     tags:
 *       - Admin Price Rules
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
 *         description: Price rule deleted
 * 
 * /api/v1/admin/price-rule/{id}/deactivate:
 *   patch:
 *     summary: Deactivate Price Rule
 *     tags:
 *       - Admin Price Rules
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
 *         description: Price rule deactivated
 */
