/**
 * @swagger
 * tags:
 *   name: Admin Dashboard
 *   description: Admin dashboard analytics APIs
 */

/**
 * @swagger
 * /admin/dashboard/dashboard/summary:
 *   get:
 *     summary: Get admin dashboard summary
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Dashboard summary fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     booking:
 *                       type: object
 *                       properties:
 *                         totalToday:
 *                           type: number
 *                           example: 25
 *                         statusWise:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: completed
 *                               count:
 *                                 type: number
 *                                 example: 10
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 1200
 *                         newToday:
 *                           type: number
 *                           example: 12
 *                     drivers:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 300
 *                         verificationPending:
 *                           type: number
 *                           example: 15
 *                         online:
 *                           type: number
 *                           example: 80
 *                         offline:
 *                           type: number
 *                           example: 220
 *                     stores:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 150
 *                         online:
 *                           type: number
 *                           example: 40
 *                         offline:
 *                           type: number
 *                           example: 110
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /admin/dashboard/dashboard/chart:
 *   get:
 *     summary: Get admin dashboard chart data
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [booking, user, driver, store]
 *           example: booking
 *       - in: query
 *         name: range
 *         required: true
 *         schema:
 *           type: string
 *           enum: [today, week, month, year]
 *           example: week
 *     responses:
 *       200:
 *         description: Chart data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chart data fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Mon
 *                       value:
 *                         type: number
 *                         example: 45
 *                       maxValue:
 *                         type: number
 *                         example: 100
 *       401:
 *         description: Unauthorized
 */
