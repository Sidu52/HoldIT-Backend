/**
 * @swagger
 * /api/v1/user/profile:
 *   get:
 *     summary: Get User Profile Details
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data returned
 *   put:
 *     summary: Update User Profile
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 * 
 * /api/v1/user/addresses:
 *   get:
 *     summary: Get User Stored Addresses
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of saved addresses
 *   post:
 *     summary: Add New Stored Address
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addressLine1:
 *               - city
 *               - pincode
 *             properties:
 *               addressLine1:
 *                 type: string
 *               addressLine2:
 *                 type: string
 *               city:
 *                 type: string
 *               pincode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Address added
 * 
 * /api/v1/user/address/{id}:
 *   get:
 *     summary: Get Stored Address by ID
 *     tags:
 *       - User Profile
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
 *         description: Address details
 *   put:
 *     summary: Update Stored Address
 *     tags:
 *       - User Profile
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
 *               addressLine1:
 *                 type: string
 *               city:
 *                 type: string
 *     responses:
 *       200:
 *         description: Address updated
 *   delete:
 *     summary: Delete Stored Address
 *     tags:
 *       - User Profile
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
 *         description: Address deleted
 * 
 * /api/v1/user/stores/nearest:
 *   get:
 *     summary: Find Nearest Store to Location
 *     tags:
 *       - User Profile
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
 *         description: Nearest store details
 * 
 * /api/v1/user/stores/{store_id}:
 *   get:
 *     summary: Get Store Details by Store ID
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: store_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store details
 * 
 * /api/v1/user/location:
 *   put:
 *     summary: Update Current User Coordinates
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 */