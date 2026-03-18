/**
 * @swagger
 *   /api/v1/serviceable_area/bulk_upload:
 *     post:
 *       summary: Bulk Upload Service Areas
 *       tags:
 *         - Bulk Upload
 *       responses:
 *         200:
 *           description: Successful response
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: boolean
 *                     example: true
 *                 required:
 *                   - status
 *       security:
 *         - bearerAuth:
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 areas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: Andheri West
 *                       city:
 *                         type: string
 *                         example: Mumbai
 *                       state:
 *                         type: string
 *                         example: Maharashtra
 *                       pincode:
 *                         type: string
 *                         example: 400058
 *                       location:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: Point
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                         required:
 *                           - type
 *                           - coordinates
 *                       service_radius_km:
 *                         type: number
 *                         example: 5
 *                       delivery_charge:
 *                         type: number
 *                         example: 30
 *                     required:
 *                       - name
 *                       - city
 *                       - state
 *                       - pincode
 *                       - location
 *                       - service_radius_km
 *                       - delivery_charge
 *               required:
 *                 - areas
 */