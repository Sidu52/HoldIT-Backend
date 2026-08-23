import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectUser } from "../../middlewares/auth.middleware.js";
import { checkUserAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    getProfile,
    updateProfile,
    getNearestStore,
    getStoreById,
    addAddress,
    getAddresses,
    getAddressById,
    updateAddress,
    deleteAddress,
    updateLocation,
    updatePushToken,
} from "../../controllers/user/user.user.controller.js";
import {
    nearestStoreSchema,
    updateProfileSchema,
    storeIdSchema,
} from "../../validations/user/user.profile.validation.js";
import {
    addAddressSchema,
    updateAddressSchema,
} from "../../validations/user/user.address.validation.js";

const router = express.Router();

router.use(authMiddleware, protectUser, checkUserAccountStatus);


// Get profile
router.get(
    "/profile",
    apiLimiter,
    getProfile
);

// Update profile
router.put(
    "/profile",
    apiLimiter,
    validate(updateProfileSchema),
    updateProfile
);

// Update push token
router.put(
    "/push-token",
    apiLimiter,
    updatePushToken
);

// ADDRESSES
router.get(
    "/addresses",
    apiLimiter,
    getAddresses
);

router.get(
    "/address/:id",
    apiLimiter,
    getAddressById
);

router.post(
    "/addresses",
    apiLimiter,
    validate({ body: addAddressSchema }),
    addAddress
);

router.put(
    "/address/:id",
    apiLimiter,
    validate({ body: updateAddressSchema }),
    updateAddress
);

router.delete(
    "/address/:id",
    apiLimiter,
    deleteAddress
);

// Find nearest store
router.get(
    "/stores/nearest",
    apiLimiter,
    getNearestStore
);

// Get store details
router.get(
    "/stores/:store_id",
    apiLimiter,
    validate(storeIdSchema, "params"),
    getStoreById
);

router.put(
    "/location",
    apiLimiter,
    updateLocation
);

export default router;