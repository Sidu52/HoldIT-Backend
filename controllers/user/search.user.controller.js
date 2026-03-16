import Store from "../../models/Store.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";
import { logSearchQuery } from "../../utils/logSearchQuery.js";

const SEARCH_DEFAULTS = {
    RADIUS_METERS: 5000,
    MIN_RADIUS: 100,
    MAX_RADIUS: 50000,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 50,
    MIN_QUERY_LENGTH: 2,
    MAX_QUERY_LENGTH: 100,
    QUERY_TIMEOUT_MS: 5000,
};

const validateLatitude = (lat) => {
    const parsed = parseFloat(lat);
    if (isNaN(parsed) || parsed < -90 || parsed > 90) {
        return null;
    }
    return parsed;
};

const validateLongitude = (lng) => {
    const parsed = parseFloat(lng);
    if (isNaN(parsed) || parsed < -180 || parsed > 180) {
        return null;
    }
    return parsed;
};

const validateRadius = (radius) => {
    const parsed = parseInt(radius, 10);
    if (isNaN(parsed)) {
        return SEARCH_DEFAULTS.RADIUS_METERS;
    }
    return Math.max(
        SEARCH_DEFAULTS.MIN_RADIUS,
        Math.min(parsed, SEARCH_DEFAULTS.MAX_RADIUS)
    );
};

const validateLimit = (limit) => {
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1) {
        return SEARCH_DEFAULTS.DEFAULT_LIMIT;
    }
    return Math.min(parsed, SEARCH_DEFAULTS.MAX_LIMIT);
};

const validatePage = (page) => {
    const parsed = parseInt(page, 10);
    if (isNaN(parsed) || parsed < 1) {
        return 1;
    }
    return Math.min(parsed, 100); // Cap at 100 pages
};

const sanitizeQuery = (query) => {
    if (!query || typeof query !== "string") {
        return "";
    }

    return query
        .trim()
        .replace(/[<>{}$()|\[\]\\\/\^\*\+\?\.]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, SEARCH_DEFAULTS.MAX_QUERY_LENGTH);
};

const validateSort = (sort) => {
    const allowedSorts = ["distance", "rating", "price", "newest"];
    if (allowedSorts.includes(sort)) {
        return sort;
    }
    return "distance";
};

const buildBaseFilter = () => ({
    is_active: true,
    status: ACCOUNT_STATUS.ACTIVE,
    verification_status: VERIFICATION_STATUS.VERIFIED,
});

const buildCapacityField = () => ({
    $subtract: ["$max_booking_capacity", "$booking_assigned_count"],
});

const formatDistance = (distanceMeters) => {
    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)} m`;
    }
    return `${(distanceMeters / 1000).toFixed(1)} km`;
};

// CONTROLLER: SEARCH STORES
export const searchStores = async (req, res) => {
    try {
        const {
            q,
            lat,
            lng,
            radius,
            sort,
            open_now,
            limit: limitParam,
            page: pageParam,
        } = req.query;

        const sanitizedQuery = sanitizeQuery(q);
        const latitude = lat !== undefined ? validateLatitude(lat) : null;
        const longitude = lng !== undefined ? validateLongitude(lng) : null;
        const searchRadius = validateRadius(radius);
        const sortBy = validateSort(sort);
        const limit = validateLimit(limitParam);
        const page = validatePage(pageParam);
        const skip = (page - 1) * limit;
        const filterOpenNow = open_now === "true";

        if (
            !sanitizedQuery &&
            (latitude === null || longitude === null)
        ) {
            return sendError(
                res,
                "Please provide a search query or location coordinates",
                STATUS_CODES.BAD_REQUEST
            );
        }

        if (
            sanitizedQuery &&
            sanitizedQuery.length < SEARCH_DEFAULTS.MIN_QUERY_LENGTH
        ) {
            return sendError(
                res,
                `Search query must be at least ${SEARCH_DEFAULTS.MIN_QUERY_LENGTH} characters`,
                STATUS_CODES.BAD_REQUEST
            );
        }

        // Validate coordinates are both present if one is provided
        if (
            (latitude !== null && longitude === null) ||
            (latitude === null && longitude !== null)
        ) {
            return sendError(
                res,
                "Both latitude and longitude are required for location-based search",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const hasGeo = latitude !== null && longitude !== null;

        // Build Aggregation Pipeline
        const pipeline = [];

        // Geo query
        if (hasGeo) {
            pipeline.push({
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [longitude, latitude],
                    },
                    distanceField: "distance_meters",
                    maxDistance: searchRadius,
                    spherical: true,
                    query: buildBaseFilter(),
                },
            });
        }

        // Base filter
        if (!hasGeo) {
            pipeline.push({
                $match: buildBaseFilter(),
            });
        }

        // Text search filter
        if (sanitizedQuery) {
            const searchRegex = new RegExp(sanitizedQuery, "i");
            pipeline.push({
                $match: {
                    $or: [
                        { store_name: { $regex: searchRegex } },
                        { store_address: { $regex: searchRegex } },
                        { "location.address": { $regex: searchRegex } },
                        { store_description: { $regex: searchRegex } },
                    ],
                },
            });
        }

        if (filterOpenNow) {
            pipeline.push({
                $match: {
                    is_online: true,
                },
            });
        }

        pipeline.push({
            $addFields: {
                available_capacity: buildCapacityField(),
                ...(hasGeo && {
                    distance_formatted: {
                        $cond: {
                            if: { $lt: ["$distance_meters", 1000] },
                            then: {
                                $concat: [
                                    { $toString: { $round: ["$distance_meters", 0] } },
                                    " m",
                                ],
                            },
                            else: {
                                $concat: [
                                    {
                                        $toString: {
                                            $round: [{ $divide: ["$distance_meters", 1000] }, 1],
                                        },
                                    },
                                    " km",
                                ],
                            },
                        },
                    },
                }),
            },
        });

        // Sort
        const sortStage = {};
        switch (sortBy) {
            case "distance":
                if (hasGeo) {
                    sortStage.distance_meters = 1; // Nearest first
                } else {
                    sortStage.rating = -1; // Fallback to rating if no geo
                }
                break;
            case "rating":
                sortStage.rating = -1;
                sortStage.rating_count = -1;
                break;
            case "newest":
                sortStage.createdAt = -1;
                break;
            default:
                if (hasGeo) {
                    sortStage.distance_meters = 1;
                } else {
                    sortStage.rating = -1;
                }
        }
        pipeline.push({ $sort: sortStage });

        // Facet for pagination
        pipeline.push({
            $facet: {
                metadata: [{ $count: "total" }],
                results: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            _id: 1,
                            store_name: 1,
                            store_address: 1,
                            store_open_time: 1,
                            store_close_time: 1,
                            store_contact_number: 1,
                            location: {
                                coordinates: "$location.coordinates",
                                address: "$location.address",
                            },
                            is_online: 1,
                            rating: 1,
                            rating_count: 1,
                            available_capacity: 1,
                            max_booking_capacity: 1,
                            ...(hasGeo && {
                                distance_meters: 1,
                                distance_formatted: 1,
                            }),
                        },
                    },
                ],
            },
        });

        // Execute Query
        const [result] = await Store.aggregate(pipeline)
            .option({ maxTimeMS: SEARCH_DEFAULTS.QUERY_TIMEOUT_MS })
            .exec();

        const total = result.metadata[0]?.total || 0;
        const stores = result.results || [];
        const totalPages = Math.ceil(total / limit);

        // Log search for analytics
        if (process.env.NODE_ENV !== "test") {
            logSearchQuery({
                query: sanitizedQuery,
                lat: latitude,
                lng: longitude,
                radius: searchRadius,
                resultCount: total,
                userId: req.user?._id,
            }).catch(() => { });
        }

        return sendResponse({
            res,
            message:
                total > 0
                    ? `Found ${total} store${total > 1 ? "s" : ""}`
                    : "No stores found in this area",
            data: {
                stores,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                },
                meta: {
                    query: sanitizedQuery || null,
                    searchType: hasGeo
                        ? sanitizedQuery
                            ? "text_geo"
                            : "geo"
                        : "text",
                    coordinates: hasGeo ? { lat: latitude, lng: longitude } : null,
                    radiusMeters: hasGeo ? searchRadius : null,
                    sort: sortBy,
                    filters: {
                        openNow: filterOpenNow,
                    },
                },
            },
        });
    } catch (err) {
        if (process.env.NODE_ENV === "development") {
            console.error("Search stores error:", err);
        } else {
            console.error("Search stores error:", err.message);
        }
        return sendError(
            res,
            "Search failed. Please try again.",
            STATUS_CODES.INTERNAL_SERVER_ERROR
        );
    }
};

//  CONTROLLER: GET NEARBY STORES
export const getNearbyStores = async (req, res) => {
    try {
        const {
            lat,
            lng,
            radius,
            open_now,
            limit: limitParam,
            page: pageParam,
        } = req.query;

        // Validate Required Coordinates
        if (lat === undefined || lng === undefined) {
            return sendError(
                res,
                "Latitude and longitude are required",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const latitude = validateLatitude(lat);
        const longitude = validateLongitude(lng);

        if (latitude === null || longitude === null) {
            return sendError(
                res,
                "Invalid coordinates. Latitude must be -90 to 90, longitude -180 to 180",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const searchRadius = validateRadius(radius);
        const limit = validateLimit(limitParam);
        const page = validatePage(pageParam);
        const skip = (page - 1) * limit;
        const filterOpenNow = open_now === "true";

        // Build Filter
        const baseFilter = buildBaseFilter();
        if (filterOpenNow) {
            baseFilter.is_online = true;
        }

        // Aggregation Pipeline
        const pipeline = [
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [longitude, latitude],
                    },
                    distanceField: "distance_meters",
                    maxDistance: searchRadius,
                    spherical: true,
                    query: baseFilter,
                },
            },
            {
                $addFields: {
                    available_capacity: buildCapacityField(),
                    distance_formatted: {
                        $cond: {
                            if: { $lt: ["$distance_meters", 1000] },
                            then: {
                                $concat: [
                                    { $toString: { $round: ["$distance_meters", 0] } },
                                    " m",
                                ],
                            },
                            else: {
                                $concat: [
                                    {
                                        $toString: {
                                            $round: [
                                                { $divide: ["$distance_meters", 1000] },
                                                1,
                                            ],
                                        },
                                    },
                                    " km",
                                ],
                            },
                        },
                    },
                },
            },
            { $sort: { distance_meters: 1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    results: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                store_name: 1,
                                store_address: 1,
                                store_open_time: 1,
                                store_close_time: 1,
                                store_contact_number: 1,
                                location: {
                                    coordinates: "$location.coordinates",
                                    address: "$location.address",
                                },
                                is_online: 1,
                                rating: 1,
                                rating_count: 1,
                                available_capacity: 1,
                                max_booking_capacity: 1,
                                distance_meters: 1,
                                distance_formatted: 1,
                            },
                        },
                    ],
                },
            },
        ];

        const [result] = await Store.aggregate(pipeline)
            .option({ maxTimeMS: SEARCH_DEFAULTS.QUERY_TIMEOUT_MS })
            .exec();

        const total = result.metadata[0]?.total || 0;
        const stores = result.results || [];
        const totalPages = Math.ceil(total / limit);

        return sendResponse({
            res,
            message:
                total > 0
                    ? `Found ${total} store${total > 1 ? "s" : ""} nearby`
                    : "No stores found in this area",
            data: {
                stores,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                },
                meta: {
                    searchType: "nearby",
                    coordinates: { lat: latitude, lng: longitude },
                    radiusMeters: searchRadius,
                    filters: {
                        openNow: filterOpenNow,
                    },
                },
            },
        });
    } catch (err) {
        if (process.env.NODE_ENV === "development") {
            console.error("Nearby stores error:", err);
        } else {
            console.error("Nearby stores error:", err.message);
        }
        return sendError(
            res,
            "Failed to fetch nearby stores. Please try again.",
            STATUS_CODES.INTERNAL_SERVER_ERROR
        );
    }
};

// CONTROLLER: GET STORE BY ID
export const getStoreById = async (req, res) => {
    try {
        const { id } = req.params;
        // Validate MongoDB ObjectId format
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return sendError(
                res,
                "Invalid store ID",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const store = await Store.findOne({
            _id: id,
            is_active: true,
            status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
        })
            .select({
                store_name: 1,
                store_address: 1,
                store_open_time: 1,
                store_close_time: 1,
                store_description: 1,
                store_contact_number: 1,
                location: 1,
                is_online: 1,
                rating: 1,
                rating_count: 1,
                booking_assigned_count: 1,
                max_booking_capacity: 1,
                last_active_at: 1,
                createdAt: 1,
            })
            .lean()
            .maxTimeMS(SEARCH_DEFAULTS.QUERY_TIMEOUT_MS);

        if (!store) {
            return sendError(
                res,
                "Store not found",
                STATUS_CODES.NOT_FOUND
            );
        }
        const available_capacity =
            store.max_booking_capacity - store.booking_assigned_count;

        return sendResponse({
            res,
            message: "Store details fetched successfully",
            data: {
                store: {
                    ...store,
                    available_capacity: Math.max(0, available_capacity),
                },
            },
        });
    } catch (err) {
        if (process.env.NODE_ENV === "development") {
            console.error("Get store error:", err);
        } else {
            console.error("Get store error:", err.message);
        }
        return sendError(
            res,
            "Failed to fetch store details. Please try again.",
            STATUS_CODES.INTERNAL_SERVER_ERROR
        );
    }
};