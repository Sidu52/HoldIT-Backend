/**
 * @swagger
 * /api/v1/user/support/ticket:
 *   post:
 *     summary: Create New Customer Support Ticket
 *     tags:
 *       - User Support
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - message
 *             properties:
 *               subject:
 *                 type: string
 *                 example: Issue with booking pickup
 *               message:
 *                 type: string
 *                 example: Driver arrived late
 *               bookingId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Ticket created
 * 
 * /api/v1/user/support/tickets:
 *   get:
 *     summary: Get All Customer Support Tickets
 *     tags:
 *       - User Support
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
 *         description: List of tickets
 * 
 * /api/v1/user/support/tickets/{id}:
 *   get:
 *     summary: Get Ticket Details by ID
 *     tags:
 *       - User Support
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
 *         description: Ticket conversation details
 * 
 * /api/v1/user/support/tickets/{id}/message:
 *   post:
 *     summary: Reply / Send Message to Ticket
 *     tags:
 *       - User Support
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
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: Thank you for the quick resolution.
 *     responses:
 *       200:
 *         description: Message added to ticket
 */
