import User from "../../models/User.js";
import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { set, get, del } from "../../services/redisService.js";

// Constants
import {
    ADDRESS_LIMITS,
    CACHE_KEYS,
    CACHE_TTL,
    ADDRESS_MESSAGES,
} from "../../constants/user/address.js";

// Helpers
import {
    checkServiceability,
    invalidateAddressCache,
    syncUserLocationWithAddress,
    buildAddressObject,
    findAddressById,
} from "../../helpers/user/addressHelper.js";

// CONSTANTS
const PROFILE_CACHE_TTL = 300; // 5 minutes
const STORE_CACHE_TTL = 600; // 10 minutes
const EXCLUDED_FIELDS = "-password_hash -__v";

const ALLOWED_UPDATE_FIELDS = [
    "first_name",
    "last_name",
    "gender",
    "dob",
    "address",
];

// GET PROFILE
export const getProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const cacheKey = `user:profile:${auth_id}`;

        // Check cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Profile fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Fetch from DB
        const user = await User.findById(auth_id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!user) {
            return sendError(
                res,
                "User not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Cache result
        await set(cacheKey, JSON.stringify(user), "EX", PROFILE_CACHE_TTL);

        return sendResponse({
            res,
            message: "Profile fetched successfully",
            data: user,
        });
    } catch (err) {
        console.error("Get Profile Error:", err);
        return sendError(res, "Failed to fetch profile");
    }
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;

        // Build update from allowed fields
        const updates = {};
        ALLOWED_UPDATE_FIELDS.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        // Handle location update separately
        if (req.body.lat !== undefined && req.body.lng !== undefined) {
            updates.location = {
                type: "Point",
                coordinates: [req.body.lng, req.body.lat],
            };

            // Re-check serviceability
            const { isServiceable, serviceAreaId } =
                await checkServiceability(req.body.lat, req.body.lng);

            updates.is_serviceable = isServiceable;
            updates.service_area_id = serviceAreaId;
        }

        if (Object.keys(updates).length === 0) {
            return sendError(
                res,
                "No valid fields to update",
                STATUS_CODES.BAD_REQUEST
            );
        }

        updates.updated_at = new Date();

        const updatedUser = await User.findByIdAndUpdate(
            auth_id,
            { $set: updates },
            { new: true, runValidators: true }
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

        // Invalidate cache
        await del(`user:profile:${auth_id}`);

        return sendResponse({
            res,
            message: "Profile updated successfully",
            data: updatedUser,
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(
                res,
                `${field} already in use`,
                STATUS_CODES.CONFLICT
            );
        }

        console.error("Update Profile Error:", err);
        return sendError(res, "Failed to update profile");
    }
};

// Addresses
export const getAddresses = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const cacheKey = CACHE_KEYS.USER_ADDRESSES(userId);

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: ADDRESS_MESSAGES.FETCHED,
                data: JSON.parse(cached)
            });
        }

        const user = await User.findById(userId)
            .select("addresses")
            .lean();

        if (!user) {
            return sendError(
                res,
                STATUS_CODES.NOT_FOUND,
                ADDRESS_MESSAGES.USER_NOT_FOUND
            );
        }

        const addresses = user.addresses || [];

        // Sort
        const sorted = [...addresses]
            .map((addr, idx) => ({ ...addr, _index: idx }))
            .sort((a, b) => {
                if (a.is_default !== b.is_default) {
                    return a.is_default ? -1 : 1;
                }
                return b._index - a._index;
            })
            .map(({ _index, ...addr }) => addr);

        const responseData = {
            addresses: sorted,
            total: sorted.length,
        };

        await set(cacheKey, JSON.stringify(responseData), CACHE_TTL.ADDRESSES);

        return sendResponse({
            res,
            message: ADDRESS_MESSAGES.FETCHED,
            data: responseData
        });
    } catch (error) {
        console.error("Get addresses error:", error);
        return sendError(
            res,
            ADDRESS_MESSAGES.FETCH_FAILED,
            error.message
        );
    }
};

export const getAddressById = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { id } = req.params;

        const cacheKey = CACHE_KEYS.USER_ADDRESSES(userId);

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: ADDRESS_MESSAGES.FETCHED,
                data: JSON.parse(cached)
            });
        }

        // Fetch from DB
        const user = await User.findById(userId)
            .select("addresses")
            .lean();

        if (!user) {
            return sendError(
                res,
                ADDRESS_MESSAGES.USER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }
        const address = user.addresses.find(
            addr => String(addr._id) === String(id)
        );

        if (!address) {
            return sendError(
                res,
                ADDRESS_MESSAGES.ADDRESS_NOT_FOUND,
                STATUS_CODES.NOT_FOUND,
            );
        }

        await set(cacheKey, JSON.stringify(user), "EX", CACHE_TTL.ADDRESSES);

        return sendResponse({
            res,
            message: ADDRESS_MESSAGES.FETCHED,
            data: address
        });
    } catch (error) {
        console.error("Get address by id error:", error);
        return sendError(res, error);
    }
};

export const addAddress = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { is_default } = req.body;

        // Fetch user & check limit
        const user = await User.findById(userId).select("addresses");

        if (!user) {
            return sendError(
                res,
                STATUS_CODES.NOT_FOUND,
                ADDRESS_MESSAGES.USER_NOT_FOUND
            );
        }

        if (user.addresses.length >= ADDRESS_LIMITS.MAX_ADDRESSES) {
            return sendError(
                res,
                STATUS_CODES.BAD_REQUEST,
                ADDRESS_MESSAGES.MAX_LIMIT_REACHED
            );
        }

        // Build address with serviceability
        const newAddress = await buildAddressObject(req.body);

        // First address or explicitly set default
        const shouldBeDefault = is_default === true || user.addresses.length === 0;

        if (shouldBeDefault) {
            // Unset existing default
            user.addresses.forEach((addr) => {
                addr.is_default = false;
            });
            newAddress.is_default = true;
        }

        user.addresses.push(newAddress);
        await user.save();

        if (newAddress.is_default) {
            await syncUserLocationWithAddress(userId, newAddress);
        }

        await invalidateAddressCache(userId);

        const addedAddress = user.addresses[user.addresses.length - 1];

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: ADDRESS_MESSAGES.ADDED,
            data: {
                address: addedAddress,
                total_addresses: user.addresses.length,
            }
        });
    } catch (error) {
        console.error("Add address error:", error);
        return sendError(
            res,
            ADDRESS_MESSAGES.ADD_FAILED,
            error.message
        );
    }
};

export const updateAddress = async (req, res) => {
    try {
        const userId = req.user.auth_id;
        const { id } = req.params;

        const {
            street,
            city,
            state,
            postal_code,
            country,
            coordinates,
            is_default,
        } = req.body;

        const user = await User.findById(userId).select("addresses");

        if (!user) {
            return sendError(
                res,
                STATUS_CODES.NOT_FOUND,
                ADDRESS_MESSAGES.USER_NOT_FOUND
            );
        }

        // Find address by ID
        const address = user.addresses.find(
            addr => String(addr._id) === String(id)
        );

        if (!address) {
            return sendError(
                res,
                STATUS_CODES.NOT_FOUND,
                ADDRESS_MESSAGES.ADDRESS_NOT_FOUND
            );
        }

        // Update fields
        if (street !== undefined) address.street = street.trim();
        if (city !== undefined) address.city = city.trim();
        if (state !== undefined) address.state = state.trim();
        if (postal_code !== undefined) address.postal_code = postal_code.trim();
        if (country !== undefined) address.country = country.trim();

        // Handle coordinates
        if (coordinates !== undefined) {
            address.coordinates = coordinates;

            if (coordinates?.length === 2) {
                const [lng, lat] = coordinates;
                const { isServiceable } = await checkServiceability(lat, lng);
                address.is_serviceable = isServiceable;
            } else {
                address.is_serviceable = false;
            }
        }

        // Handle default address
        if (is_default === true && !address.is_default) {
            user.addresses.forEach(addr => {
                addr.is_default = String(addr._id) === String(id);
            });
        } 
        else if (is_default === false && address.is_default) {
            const defaultCount = user.addresses.filter(a => a.is_default).length;

            if (defaultCount === 1) {
                return sendError(
                    res,
                    STATUS_CODES.BAD_REQUEST,
                    ADDRESS_MESSAGES.CANNOT_REMOVE_LAST_DEFAULT
                );
            }

            address.is_default = false;
        }

        await user.save();

        if (address.is_default) {
            await syncUserLocationWithAddress(userId, address);
        }

        await invalidateAddressCache(userId);

        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: ADDRESS_MESSAGES.UPDATED,
            data: { address }
        });

    } catch (error) {
        console.error("Update address error:", error);

        return sendError(
            res,
            ADDRESS_MESSAGES.UPDATE_FAILED,
            error.message
        );
    }
};

export const deleteAddress = async (req, res) => {
    try {
       const userId = req.user.auth_id;
        const { id } = req.params;

        const user = await User.findById(userId).select("addresses");

        if (!user) {
            return sendError(
                res,
                ADDRESS_MESSAGES.USER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        // Find index of address
        const index = user.addresses.findIndex(
            addr => String(addr._id) === String(id)
        );

        if (index === -1) {
            return sendError(
                res,
                ADDRESS_MESSAGES.ADDRESS_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const wasDefault = user.addresses[index].is_default;

        // Remove address
        user.addresses.splice(index, 1);

        // Handle default reassignment
        if (wasDefault && user.addresses.length > 0) {
            user.addresses[0].is_default = true;

            await user.save();
            await syncUserLocationWithAddress(userId, user.addresses[0]);

        } else if (user.addresses.length === 0) {

            await user.save();
            await syncUserLocationWithAddress(userId, null);

        } else {

            await user.save();
        }

        await invalidateAddressCache(userId);

        return sendResponse({
            res,
            statusCode: STATUS_CODES.SUCCESS,
            message: ADDRESS_MESSAGES.DELETED,
            data: {
                remaining_addresses: user.addresses.length,
                new_default_index:
                    wasDefault && user.addresses.length > 0 ? 0 : null
            }
        });

    } catch (error) {
        console.error("Delete address error:", error);

        return sendError(
            res,
            ADDRESS_MESSAGES.DELETE_FAILED,
            error.message
        );
    }
};

// GET NEAREST STORE
export const getNearestStore = async (req, res) => {
    try {
        const { lat, lng, max_distance = 5000 } = req.query;
        console.log("req.params",req.query)
        const latNum = Number(lat);
        const lngNum = Number(lng);
        const maxDist = Number(max_distance);

        // Cache key based on rounded coordinates (grid-based caching)
        const roundedLat = Math.round(latNum * 100) / 100;
        const roundedLng = Math.round(lngNum * 100) / 100;
        const cacheKey = `nearest_store:${roundedLat}:${roundedLng}:${maxDist}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Nearest store fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Use $geoNear for distance calculation
        const stores = await Store.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [lngNum, latNum],
                    },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: maxDist,
                    query: {
                        store_is_active: true,
                        is_deleted: { $ne: true },
                    },
                },
            },
            { $limit: 5 }, // Return top 5 nearest
            {
                $project: {
                    _id: 1,
                    store_name: 1,
                    store_address: 1,
                    store_open_time: 1,
                    store_close_time: 1,
                    location: 1,
                    distance: {
                        $round: [
                            { $divide: ["$distance", 1000] },
                            2,
                        ],
                    }, // Convert to km, round 2 decimals
                },
            },
        ]);

        if (stores.length === 0) {
            return sendError(
                res,
                "No stores found near your location",
                STATUS_CODES.NOT_FOUND
            );
        }

        const responseData = {
            nearest: stores[0],
            alternatives: stores.slice(1),
            total: stores.length,
        };

        // Cache for 10 minutes
        await set(
            cacheKey,
            JSON.stringify(responseData),
            "EX",
            STORE_CACHE_TTL
        );

        return sendResponse({
            res,
            message: "Nearest store fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Nearest Store Error:", err);
        return sendError(res, "Failed to find nearest store");
    }
};

// GET STORE BY ID
export const getStoreById = async (req, res) => {
    try {
        const { store_id } = req.params;
        console.log("store Id", store_id)

        const cacheKey = `store:public:${store_id}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Store fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const store = await Store.findOne({
            _id: store_id,
            store_is_active: true,
            is_deleted: { $ne: true },
        })
            .select(
                "store_name store_address store_open_time store_close_time store_description location store_capacity"
            )
            .lean();

        if (!store) {
            return sendError(
                res,
                "Store not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        await set(
            cacheKey,
            JSON.stringify(store),
            "EX",
            STORE_CACHE_TTL
        );

        return sendResponse({
            res,
            message: "Store fetched successfully",
            data: store,
        });
    } catch (err) {
        console.error("Get Store By ID Error:", err);
        return sendError(res, "Failed to fetch store");
    }
};
