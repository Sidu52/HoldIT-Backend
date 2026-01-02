import Driver from "../../models/Driver.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { get, set } from "../../services/redisService.js";

// Get Drivers (List)
export const getDrivers = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, isAvailable } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (status) filter.status = status;
        if (isAvailable !== undefined) {
            filter.is_available = isAvailable === "true";
        }

        const cacheKey = `drivers:${pageNum}:${limitNum}:${status || "all"}:${isAvailable ?? "all"}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Drivers fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const [drivers, total] = await Promise.all([
            Driver.find(filter)
                .select("-__v -password_hash")
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Driver.countDocuments(filter),
        ]);

        const responseData = {
            drivers,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        };

        await set(cacheKey, JSON.stringify(responseData), "EX", 120);

        sendResponse({
            res,
            message: "Drivers fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Drivers Error:", err);
        sendError(res, "Failed to fetch drivers");
    }
};


// Get Driver By ID
export const getDriverById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return sendError(res, "Driver ID is required", 400);
        }

        const cacheKey = `driver:${id}`;
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Driver fetched successfully",
                data: JSON.parse(cached),
            });
        }

        const driver = await Driver.findById(id)
            .select("-__v -password_hash")
            .lean();

        if (!driver) {
            return sendError(res, "Driver not found", 404);
        }

        await set(cacheKey, JSON.stringify(driver), "EX", 120);

        sendResponse({
            res,
            message: "Driver fetched successfully",
            data: driver,
        });
    } catch (err) {
        console.error("Get Driver Error:", err);
        sendError(res, "Failed to fetch driver");
    }
};


// Create Driver
export const createDriver = async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            phone,
            email,
            vehicle_type,
            license_number,
        } = req.body;

        if (!phone || !license_number) {
            return sendError(res, "Phone and license number are required", 400);
        }

        const driver = await Driver.create({
            first_name,
            last_name,
            phone,
            email,
            vehicle_type,
            license_number,
            status: "active",
            is_available: true,
        });

        // Invalidate drivers cache
        await set("drivers:*", "", "EX", 1);

        sendResponse({
            res,
            message: "Driver created successfully",
            data: driver,
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return sendError(res, `${field} already exists`, 409);
        }

        console.error("Create Driver Error:", err);
        sendError(res, "Failed to create driver");
    }
};

// Update Driver
export const updateDriver = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return sendError(res, "Driver ID is required", 400);
        }

        const allowedFields = [
            "first_name",
            "last_name",
            "phone",
            "email",
            "vehicle_type",
            "status",
            "is_available",
        ];

        const updates = {};
        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return sendError(res, "No fields to update", 400);
        }

        const driver = await Driver.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select("-__v -password_hash");

        if (!driver) {
            return sendError(res, "Driver not found", 404);
        }

        // Invalidate cache
        await Promise.all([
            set(`driver:${id}`, "", "EX", 1),
            set("drivers:*", "", "EX", 1),
        ]);

        sendResponse({
            res,
            message: "Driver updated successfully",
            data: driver,
        });
    } catch (err) {
        console.error("Update Driver Error:", err);
        sendError(res, "Failed to update driver");
    }
};


// Delete Driver
export const deleteDriver = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return sendError(res, "Driver ID is required", 400);
        }

        const driver = await Driver.findByIdAndDelete(id);
        if (!driver) {
            return sendError(res, "Driver not found", 404);
        }

        // Invalidate cache
        await Promise.all([
            set(`driver:${id}`, "", "EX", 1),
            set("drivers:*", "", "EX", 1),
        ]);

        sendResponse({
            res,
            message: "Driver deleted successfully",
        });
    } catch (err) {
        console.error("Delete Driver Error:", err);
        sendError(res, "Failed to delete driver");
    }
};
