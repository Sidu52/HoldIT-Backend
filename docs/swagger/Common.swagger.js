/**
 * @swagger
 * /api/v1/me:
 *   get:
 *     summary: Get Authenticated User Identity
 *     tags:
 *       - Common
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user identity and role details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                     role:
 *                       type: string
 *                       example: "USER"
 *       401:
 *         description: Unauthorized
 */
