/**
 * @swagger
 * /api/v1/admin/dashboard/summary:
 *   get:
 *     summary: Get Admin Dashboard Summary
 *     tags:
 *       - Admin Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics & KPI summary returned
 * 
 * /api/v1/admin/dashboard/chart:
 *   get:
 *     summary: Get Admin Dashboard Chart Analytics
 *     tags:
 *       - Admin Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [REVENUE, BOOKINGS, USERS]
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [DAILY, WEEKLY, MONTHLY, YEARLY, CUSTOM]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Chart data returned
 */
