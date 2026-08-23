/**
 * @swagger
 * /api/v1/store-owner/profile:
 *   get:
 *     summary: Get Store Owner Profile Details
 *     tags:
 *       - Store Owner Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data returned
 *   put:
 *     summary: Update Store Owner Profile
 *     tags:
 *       - Store Owner Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 * 
 * /api/v1/store-owner/profile/update-phone-otp:
 *   post:
 *     summary: Request OTP to Change Store Owner Phone Number
 *     tags:
 *       - Store Owner Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OTP sent to new phone number
 * 
 * /api/v1/store-owner/complete-profile:
 *   post:
 *     summary: Complete Store Owner Profile Setup
 *     tags:
 *       - Store Owner Management
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: Owner Name
 *               email:
 *                 type: string
 *                 example: owner@gmail.com
 *     responses:
 *       200:
 *         description: Profile completed
 * 
 * /api/v1/store-owner/dashboard:
 *   get:
 *     summary: Get Store Owner Multi-Store Dashboard Analytics
 *     tags:
 *       - Store Owner Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business analytics and store metrics returned
 * 
 * /api/v1/store-owner/stores:
 *   get:
 *     summary: Get All Stores Owned by Store Owner
 *     tags:
 *       - Store Owner Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of stores
 *   post:
 *     summary: Create New Storage Store under Owner Account
 *     tags:
 *       - Store Owner Management
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
 *               - address
 *               - totalCapacity
 *             properties:
 *               name:
 *                 type: string
 *                 example: Owner Store 1
 *               address:
 *                 type: string
 *                 example: 456 Station Road
 *               totalCapacity:
 *                 type: integer
 *                 example: 100
 *     responses:
 *       201:
 *         description: Store created successfully
 * 
 * /api/v1/store-owner/stores/{id}:
 *   get:
 *     summary: Get Owned Store Details by ID
 *     tags:
 *       - Store Owner Management
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
 *         description: Store details
 *   put:
 *     summary: Update Owned Store Details
 *     tags:
 *       - Store Owner Management
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
 *               totalCapacity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Store details updated
 *   delete:
 *     summary: Delete Owned Store
 *     tags:
 *       - Store Owner Management
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
 *         description: Store deleted
 * 
 * /api/v1/store-owner/stores/{store_id}/go-online:
 *   put:
 *     summary: Toggle Online Duty Status for Owned Store
 *     tags:
 *       - Store Owner Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
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
 *               - is_online
 *             properties:
 *               is_online:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Online status updated
 */
