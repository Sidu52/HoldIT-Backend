/**
 * @swagger
 * /api/v1/admin/support/summary:
 *   get:
 *     summary: Get Support Dashboard Analytics & Summary
 *     tags:
 *       - Admin Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ticket & chat analytics breakdown returned
 * 
 * /api/v1/admin/support:
 *   get:
 *     summary: List All Support Tickets & Live Chats Across All Roles
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
 *         name: role
 *         schema:
 *           type: string
 *           enum: [User, Driver, Store, StoreOwner]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, pending, awaiting_user, awaiting_admin, resolved, closed]
 *       - in: query
 *         name: chatType
 *         schema:
 *           type: string
 *           enum: [TICKET, BOT_CHAT, LIVE_CHAT]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of support tickets & live chats
 * 
 * /api/v1/admin/support/{id}:
 *   get:
 *     summary: Get Admin Ticket / Live Chat Details by ID
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
 *         description: Detailed conversation thread
 * 
 * /api/v1/admin/support/{id}/reply:
 *   post:
 *     summary: Reply as Admin to Ticket / Live Chat Message
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
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Hello, I am looking into your request now."
 *     responses:
 *       201:
 *         description: Reply sent & socket notification emitted
 * 
 * /api/v1/admin/support/{id}/status:
 *   patch:
 *     summary: Update Support Ticket Status
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, pending, awaiting_user, awaiting_admin, resolved, closed]
 *     responses:
 *       200:
 *         description: Ticket status updated
 * 
 * /api/v1/admin/support/{id}/assign:
 *   patch:
 *     summary: Assign Ticket to Support Agent
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
 *               - adminId
 *             properties:
 *               adminId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket assigned to agent
 */
