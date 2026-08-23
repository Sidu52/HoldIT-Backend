
import mongoose from "mongoose";

import User from "../../models/User.js";
import Store from "../../models/Store.js";

import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS, STATUS_CODES } from "../../utils/constants.js";

import { cacheAside, deleteCache, getCache } from "../../constants/redis/redisOperation.js";
import { UserKeys, UserTTL } from "../../constants/redis/user.keys.js";
import { StoreKeys, StoreTTL } from "../../constants/redis/store.keys.js";

import { ADDRESS_LIMITS, ADDRESS_MESSAGES } from "../../constants/user/address.js";

import { checkServiceability, invalidateAddressCache, syncUserLocationWithAddress, buildAddressObject, formatAddressString, isDuplicateAddress } from "../../helpers/user/addressHelper.js";

import asyncHandler from "../../utils/asyncHandler.js";
import logger from "../../utils/logger.js";

const EXCLUDED_FIELDS = "-__v";

const ALLOWED_UPDATE_FIELDS = [
    "first_name",
    "last_name",
    "gender",
    "date_of_birth",
];

const isValidCoordinatePair = (coordinates = []) => {
    return (
        Array.isArray(coordinates) &&
        coordinates.length === 2 &&
        coordinates.every(
            (coord) =>
                typeof coord === "number" &&
                !Number.isNaN(coord)
        )
    );
};

const sanitizeString = (value) => {
    return typeof value === "string"
        ? value.trim()
        : undefined;
};


// GET PROFILE
export const getProfile = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;

    const user = await cacheAside(
        UserKeys.profile(userId),
        UserTTL.PROFILE,
        () => User.findById(userId).select(EXCLUDED_FIELDS).lean()
    );

    if (!user) {
        return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
    }

    return sendResponse({
        res,
        message: "Profile fetched successfully",
        data: user,
    });
});

// UPDATE PROFILE
export const updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;

    const updates = {};

    for (const field of ALLOWED_UPDATE_FIELDS) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    // Handle location update
    if (
        req.body.lat !== undefined ||
        req.body.lng !== undefined
    ) {
        const lat = Number(req.body.lat);
        const lng = Number(req.body.lng);

        if (
            Number.isNaN(lat) ||
            Number.isNaN(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
        ) {
            return sendError(
                res,
                "Invalid coordinates",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const {
            isServiceable,
            serviceAreaId,
        } = await checkServiceability(lng, lat);

        updates.location = {
            type: "Point",
            coordinates: [lng, lat],
        };

        updates.is_serviceable = isServiceable;
        updates.service_area_id = serviceAreaId || null;
    }

    if (Object.keys(updates).length === 0) {
        return sendError(
            res,
            "No valid fields to update",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
            $set: updates,
        },
        {
            new: true,
            runValidators: true,
            context: "query",
        }
    )
        .select(EXCLUDED_FIELDS)
        .lean();

    if (!updatedUser) {
        return sendError(
            res,
            "User not found",
            STATUS_CODES.NOT_FOUND
        );
    }

    await deleteCache(UserKeys.profile(userId));

    return sendResponse({
        res,
        message: "Profile updated successfully",
        data: updatedUser,
    });
});

// GET ADDRESSES
export const getAddresses = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;

    const responseData = await cacheAside(
        UserKeys.addressList(userId),
        UserTTL.ADDRESS_LIST,
        async () => {
            const user = await User.findById(userId)
                .select("addresses")
                .lean();

            if (!user) {
                return null;
            }

            const addresses = [...(user.addresses || [])]
                .map((addr, index) => ({
                    ...addr,
                    _index: index,
                }))
                .sort((a, b) => {
                    if (a.is_default !== b.is_default) {
                        return a.is_default ? -1 : 1;
                    }

                    return b._index - a._index;
                })
                .map(({ _index, ...rest }) => rest);

            return {
                addresses,
                total: addresses.length,
            };
        }
    );

    if (!responseData) {
        return sendError(
            res,
            ADDRESS_MESSAGES.USER_NOT_FOUND,
            STATUS_CODES.NOT_FOUND
        );
    }

    return sendResponse({
        res,
        message: ADDRESS_MESSAGES.FETCHED,
        data: responseData,
    });
});

// GET ADDRESS BY ID
export const getAddressById = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;
    const { id } = req.params;

    const address = await cacheAside(
        UserKeys.addressDetail(userId, id),
        UserTTL.ADDRESS_DETAIL,
        async () => {
            const user = await User.findById(userId)
                .select("addresses")
                .lean();

            if (!user) return null;

            return (
                user.addresses.find(
                    (addr) => String(addr._id) === String(id)
                ) || null
            );
        }
    );

    if (!address) {
        return sendError(
            res,
            ADDRESS_MESSAGES.ADDRESS_NOT_FOUND,
            STATUS_CODES.NOT_FOUND
        );
    }

    return sendResponse({
        res,
        message: ADDRESS_MESSAGES.FETCHED,
        data: address,
    });
});

// ADD ADDRESS
export const addAddress = asyncHandler(async (req, res) => {
    const session =
        await mongoose.startSession();

    session.startTransaction();

    try {
        const userId = req.user.auth_id;

        const user = await User.findById(userId)
            .select("addresses")
            .session(session);

        if (!user) {
            if (session.inTransaction()) await session.abortTransaction();

            return sendError(
                res,
                ADDRESS_MESSAGES.USER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        if (
            user.addresses.length >=
            ADDRESS_LIMITS.MAX_ADDRESSES
        ) {
            if (session.inTransaction()) await session.abortTransaction();

            return sendError(
                res,
                ADDRESS_MESSAGES.MAX_LIMIT_REACHED,
                STATUS_CODES.BAD_REQUEST
            );
        }

        const newAddress =
            await buildAddressObject(req.body);

        // Check for duplicate address
        if (isDuplicateAddress(user.addresses, newAddress)) {
            if (session.inTransaction()) await session.abortTransaction();

            return sendError(
                res,
                ADDRESS_MESSAGES.DUPLICATE_ADDRESS,
                STATUS_CODES.CONFLICT
            );
        }

        const shouldBeDefault =
            req.body.is_default === true ||
            user.addresses.length === 0;

        if (shouldBeDefault) {
            user.addresses.forEach((addr) => {
                addr.is_default = false;
            });

            newAddress.is_default = true;

            if (newAddress.coordinates && newAddress.coordinates.length === 2) {
                const [lng, lat] = newAddress.coordinates;
                const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);
                user.is_serviceable = isServiceable;
                user.service_area_id = serviceAreaId;
                user.location = {
                    type: "Point",
                    coordinates: [lng, lat],
                    address: formatAddressString(newAddress),
                };
            }
        }

        user.addresses.push(newAddress);

        await user.save({ session });

        await session.commitTransaction();

        const addedAddress =
            user.addresses[
            user.addresses.length - 1
            ];

        await invalidateAddressCache(userId);

        await deleteCache(UserKeys.profile(userId));

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: ADDRESS_MESSAGES.ADDED,
            data: {
                address: addedAddress,
                total_addresses:
                    user.addresses.length,
            },
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        throw error;
    } finally {
        session.endSession();
    }
});

// UPDATE ADDRESS
export const updateAddress = asyncHandler(
    async (req, res) => {
        const userId = req.user.auth_id;
        const { id } = req.params;

        const user = await User.findById(userId)
            .select("addresses");

        if (!user) {
            return sendError(
                res,
                ADDRESS_MESSAGES.USER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const address = user.addresses.find(
            (addr) =>
                String(addr._id) === String(id)
        );

        if (!address) {
            return sendError(
                res,
                ADDRESS_MESSAGES.ADDRESS_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const {
            street,
            city,
            state,
            postal_code,
            country,
            coordinates,
            is_default,
            label,
            type,
            address_type,
        } = req.body;

        const resolvedType = type || address_type;
        if (sanitizeString(resolvedType)) {
            address.type = sanitizeString(resolvedType);
        }

        if (sanitizeString(street)) {
            address.street =
                sanitizeString(street);
        }

        if (sanitizeString(city)) {
            address.city = sanitizeString(city);
        }

        if (sanitizeString(state)) {
            address.state =
                sanitizeString(state);
        }

        if (sanitizeString(postal_code)) {
            address.postal_code =
                sanitizeString(postal_code);
        }

        if (sanitizeString(country)) {
            address.country =
                sanitizeString(country);
        }

        if (sanitizeString(label)) {
            address.label =
                sanitizeString(label);
        }

        // Coordinates
        if (coordinates !== undefined) {
            if (
                !isValidCoordinatePair(
                    coordinates
                )
            ) {
                return sendError(
                    res,
                    "Invalid coordinates format",
                    STATUS_CODES.BAD_REQUEST
                );
            }

            address.coordinates =
                coordinates;

            const [lng, lat] = coordinates;

            const {
                isServiceable,
            } =
                await checkServiceability(
                    lng,
                    lat
                );

            address.is_serviceable =
                isServiceable;
        }

        // Check for duplicate address
        const potentialAddress = {
            street: street || address.street,
            city: city || address.city,
            state: state || address.state,
            postal_code: postal_code || address.postal_code,
            country: country || address.country,
            coordinates: coordinates !== undefined ? coordinates : address.coordinates,
        };

        if (isDuplicateAddress(user.addresses, potentialAddress, id)) {
            return sendError(
                res,
                ADDRESS_MESSAGES.DUPLICATE_ADDRESS,
                STATUS_CODES.CONFLICT
            );
        }

        // Default handling
        if (
            is_default === true &&
            !address.is_default
        ) {
            user.addresses.forEach((addr) => {
                addr.is_default =
                    String(addr._id) ===
                    String(id);
            });
        }

        if (address.is_default && address.coordinates?.length === 2) {
            const [lng, lat] = address.coordinates;
            const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);
            user.is_serviceable = isServiceable;
            user.service_area_id = serviceAreaId;
            user.location = {
                type: "Point",
                coordinates: [lng, lat],
                address: formatAddressString(address),
            };
        }

        await user.save();

        await invalidateAddressCache(userId);
        await deleteCache(UserKeys.addressDetail(userId, id));
        await deleteCache(UserKeys.profile(userId));

        return sendResponse({
            res,
            message: ADDRESS_MESSAGES.UPDATED,
            data: {
                address,
            },
        });
    }
);

// DELETE ADDRESS
export const deleteAddress = asyncHandler(
    async (req, res) => {
        const userId = req.user.auth_id;
        const { id } = req.params;

        const user = await User.findById(userId)
            .select("addresses");

        if (!user) {
            return sendError(
                res,
                ADDRESS_MESSAGES.USER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const index =
            user.addresses.findIndex(
                (addr) =>
                    String(addr._id) ===
                    String(id)
            );

        if (index === -1) {
            return sendError(
                res,
                ADDRESS_MESSAGES.ADDRESS_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const removedAddress =
            user.addresses[index];

        const wasDefault =
            removedAddress.is_default;

        user.addresses.splice(index, 1);

        if (
            wasDefault &&
            user.addresses.length > 0
        ) {
            user.addresses[0].is_default = true;
            if (user.addresses[0].coordinates?.length === 2) {
                const [lng, lat] = user.addresses[0].coordinates;
                const { isServiceable, serviceAreaId } = await checkServiceability(lng, lat);
                user.is_serviceable = isServiceable;
                user.service_area_id = serviceAreaId;
                user.location = {
                    type: "Point",
                    coordinates: [lng, lat],
                    address: formatAddressString(user.addresses[0]),
                };
            }
        } else if (user.addresses.length === 0) {
            user.is_serviceable = false;
            user.service_area_id = null;
            user.location = undefined;
        }

        await user.save();

        await invalidateAddressCache(userId);

        await deleteCache(UserKeys.profile(userId));

        await deleteCache(UserKeys.addressDetail(userId, id));

        return sendResponse({
            res,
            message: ADDRESS_MESSAGES.DELETED,
            data: {
                remaining_addresses:
                    user.addresses.length,
            },
        });
    }
);

// UPDATE LOCATION
export const updateLocation = asyncHandler(
    async (req, res) => {
        const userId = req.user.auth_id;

        const lat = Number(req.body.lat);
        const lng = Number(req.body.lng);

        if (
            Number.isNaN(lat) ||
            Number.isNaN(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
        ) {
            return sendError(
                res,
                "Invalid coordinates",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const user = await User.findById(userId)
            .select("addresses");

        if (!user) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        const address = user.addresses.find(
            (addr) =>
                String(addr._id) ===
                String(req.body.address_id)
        );

        if (!address) {
            return sendError(
                res,
                "Address not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        address.coordinates = [lng, lat];

        const {
            isServiceable,
            serviceAreaId,
        } = await checkServiceability(lng,
            lat
        );

        address.is_serviceable =
            isServiceable;

        await user.save();

        await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    location: {
                        type: "Point",
                        coordinates: [lng, lat],
                    },
                    is_serviceable:
                        isServiceable,
                    service_area_id:
                        serviceAreaId || null,
                },
            },
            {
                runValidators: true,
            }
        );

        await invalidateAddressCache(userId);

        await deleteCache(UserKeys.profile(userId));

        return sendResponse({
            res,
            message: "Location updated successfully",
            data: address,
        });
    }
);

// GET NEAREST STORE
export const getNearestStore = asyncHandler(async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
        return sendError(
            res,
            "Invalid latitude or longitude",
            STATUS_CODES.BAD_REQUEST
        );
    }

    const responseData = await cacheAside(
        StoreKeys.nearest(lat, lng),
        StoreTTL.NEAREST,
        async () => {
            const stores = await Store.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [lng, lat],
                        },
                        key: "location",
                        distanceField: "distance",
                        spherical: true,
                        maxDistance: 5 * 1000,
                        query: {
                            account_status: ACCOUNT_STATUS.ACTIVE,
                            verification_status: VERIFICATION_STATUS.VERIFIED,
                        },
                    },
                },
                {
                    $addFields: {
                        availableSlots: {
                            $subtract: [
                                {
                                    $ifNull: [
                                        "$max_booking_capacity",
                                        50,
                                    ],
                                },
                                {
                                    $ifNull: [
                                        "$current_booking_count",
                                        0,
                                    ],
                                },
                            ],
                        },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        store_name: 1,
                        store_open_time: 1,
                        store_close_time: 1,
                        store_description: 1,
                        location: 1,
                        rating: 1,
                        availableSlots: 1,
                        distanceKm: {
                            $round: [
                                {
                                    $divide: [
                                        "$distance",
                                        1000,
                                    ],
                                },
                                2,
                            ],
                        },
                    },
                },
                {
                    $limit: 20,
                },
            ]);

            if (!stores.length) {
                return null;
            }

            return {
                nearest: stores[0],
                alternatives: stores.slice(1),
                total: stores.length,
            };
        }
    );

    if (!responseData) {
        return sendError(
            res,
            "No nearby stores found",
            STATUS_CODES.NOT_FOUND
        );
    }

    return sendResponse({
        res,
        message: "Nearest stores fetched successfully",
        data: responseData,
    });
});

// GET STORE BY ID
export const getStoreById = asyncHandler(async (req, res) => {
    const { store_id } = req.params;

    const store = await cacheAside(
        StoreKeys.publicView(store_id),
        StoreTTL.PUBLIC_VIEW,
        async () => {
            return Store.findOne({
                _id: store_id,
                account_status: ACCOUNT_STATUS.ACTIVE,
                verification_status: VERIFICATION_STATUS.VERIFIED,
            })
                .select(
                    `
                    store_name
                    store_open_time
                    store_close_time
                    store_description
                    location
                    store_capacity
                    rating
                `
                )
                .lean();
        }
    );

    if (!store) {
        return sendError(
            res,
            "Store not found",
            STATUS_CODES.NOT_FOUND
        );
    }

    return sendResponse({
        res,
        message: "Store fetched successfully",
        data: store,
    });
});

// UPDATE PUSH TOKEN
export const updatePushToken = asyncHandler(async (req, res) => {
    const userId = req.user.auth_id;
    const { push_token } = req.body;

    if (!push_token || typeof push_token !== "string") {
        return sendError(res, "push_token string is required", STATUS_CODES.BAD_REQUEST);
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { push_token } },
        { new: true }
    ).select("_id push_token").lean();

    if (!updatedUser) {
        return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
    }

    return sendResponse({
        res,
        message: "Push token updated successfully",
        data: { push_token: updatedUser.push_token },
    });
});
