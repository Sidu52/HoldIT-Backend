import { User, Driver, Store, StoreOwner, Admin, Booking, ServiceableArea } from "../../models/index.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { ACCOUNT_STATUS, STATUS_CODES } from "../../utils/constants.js";
import mongoose from "mongoose";

export const bulkUploadServiceableAreas = async (req, res) => {
    try {
        const { areas } = req.body;

        if (!Array.isArray(areas) || areas.length === 0) {
            return sendError(
                res,
                "Areas array is required",
                STATUS_CODES.BAD_REQUEST
            );
        }

        // ✅ Prepare documents
        const documents = areas.map((area) => {
            if (
                !area.name ||
                !area.city ||
                !area.state ||
                !area.location?.coordinates
            ) {
                throw new Error(
                    "Each area must include name, city, state and location coordinates"
                );
            }

            return {
                name: area.name,
                city: area.city,
                state: area.state,
                pincode: area.pincode,
                location: area.location,
                service_radius_km: area.service_radius_km || 5,
                delivery_charge: area.delivery_charge || 0,
            };
        });

        /**
         * ✅ insertMany with ordered:false
         * - continues even if duplicates exist
         * - better for large uploads
         */
        const result = await ServiceableArea.insertMany(documents, {
            ordered: false,
        });

        return sendResponse(
            res,
            {
                insertedCount: result.length,
                insertedRecords: result,
            },
            "Bulk serviceable areas uploaded successfully",
            STATUS_CODES.SUCCESS
        );
    } catch (error) {
        console.error("Bulk Upload Error:", error);

        return sendError(
            res,
            error.message || "Failed to bulk upload serviceable areas"
        );
    }
};

export const bulkUploadUsers = async (req, res) => {
    try {
        const { users } = req.body;
        console.log("user")

        if (!Array.isArray(users) || users.length === 0) {
            return sendError(
                res,
                STATUS_CODES.BAD_REQUEST,
                "Request body must be a non-empty array"
            );
        }

        // Validate & normalize data
        const formattedUsers = users.map((user, index) => {
            if (!user.phone) {
                throw new Error(`Phone is required at index ${index}`);
            }
            return {
                first_name: user.first_name?.trim(),
                last_name: user.last_name?.trim(),
                email: user.email?.toLowerCase(),
                phone: user.phone,
                gender: user.gender,
                dob: user.dob ? new Date(user.dob) : undefined,
                address: user.address,
                service_area_id: user.service_area_id
                    ? new mongoose.Types.ObjectId(user.service_area_id)
                    : undefined,
                status: ACCOUNT_STATUS.ACTIVE,
                is_serviceable: user.is_serviceable ?? true,
                isSignUp: user.isSignUp ?? false,
            };
        });

        /**
         * insertMany with ordered:false
         * - continues inserting even if some documents fail (duplicates)
         */
        const result = await User.insertMany(formattedUsers, {
            ordered: false,
        });
        return sendResponse(
            res,
            STATUS_CODES.SUCCESS,
            {
                insertedCount: result.length,
                failedCount: users.length - result.length,
            },
            "Users uploaded successfully"
        );
    } catch (error) {
        // Handle duplicate key error gracefully
        if (error.code === 11000) {
            return sendError(
                res,
                STATUS_CODES.BAD_REQUEST,
                "Duplicate email or phone detected"
            );
        }

        return sendError(
            res,
            error.message || "Bulk upload failed"
        );
    }
};

export const bulkUploadDriver = async (req, res) => {
    try {
        const drivers = req.body;

        if (!Array.isArray(drivers) || drivers.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please send an array of drivers"
            });
        }

        if (drivers.length > 28) {
            return res.status(400).json({
                success: false,
                message: "Maximum 28 drivers allowed in one bulk upload"
            });
        }

        const result = await Driver.insertMany(drivers, {
            ordered: false   // continue even if some fail (duplicate phone/email)
        });

        return res.status(201).json({
            success: true,
            message: "Bulk drivers uploaded successfully",
            totalInserted: result.length,
            data: result
        });

    } catch (error) {
        console.error("Bulk upload error:", error);

        return res.status(500).json({
            success: false,
            message: "Bulk upload completed with some errors",
            error: error.message
        });
    }
};


export const bulkUploadStoreOwner = async (req, res) => {
    try {
        const storeOwners = req.body;

        if (!Array.isArray(storeOwners) || storeOwners.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a non-empty array",
            });
        }

        const preparedData = storeOwners.map((owner, index) => {
            if (!owner.phone) {
                throw new Error(`Phone is required at index ${index}`);
            }

            return {
                first_name: owner.first_name?.trim(),
                last_name: owner.last_name?.trim(),
                phone: owner.phone,
                email: owner.email?.toLowerCase(),
                gender: owner.gender,
                date_of_birth: owner.date_of_birth,
                address: owner.address,
                onboarding_status: owner.onboarding_status,
                status: owner.status,
                is_verified: owner.is_verified ?? false,
                is_active: owner.is_active ?? true,
                update_by: owner.update_by || null,
                store_id: owner.store_id || null,
                account_deactivated_reason: owner.account_deactivated_reason || null,
            };
        });

        const result = await StoreOwner.insertMany(preparedData, {
            ordered: false,
            rawResult: true
        });

        res.json({
            success: true,
            insertedCount: result.insertedCount,
            insertedIds: result.insertedIds,
            writeErrors: result.mongoose?.validationErrors || []
        });
    } catch (error) {
        console.error("Bulk upload store owner error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Duplicate phone or email found",
                error: error.keyValue,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Bulk upload failed",
            error: error.message,
        });
    }
};
export const bulkUploadStore = async (req, res) => {

};

export const bulkUploadAdmin = async (req, res) => {
    try {
        const admins = req.body; // expecting array

        // 1. Validate request body
        if (!Array.isArray(admins) || admins.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a non-empty array",
            });
        }

        // 2. Prepare admins
        const preparedAdmins = await Promise.all(
            admins.map(async (admin, index) => {
                if (!admin.email) {
                    throw new Error(`Email is required at index ${index}`);
                }

                // Auto-generate password if not present
                let passwordHash = admin.password_hash;

                if (!passwordHash && admin.isVerified) {
                    const randomPassword = Math.random().toString(36).slice(-8);
                    passwordHash = await bcrypt.hash(randomPassword, 10);
                }

                return {
                    first_name: admin.first_name?.trim(),
                    last_name: admin.last_name?.trim(),
                    email: admin.email.toLowerCase().trim(),
                    phone: admin.phone,
                    address: admin.address,
                    date_of_birth: admin.date_of_birth,
                    password_hash: passwordHash,
                    status: admin.status,
                    gender: admin.gender,
                    role: admin.role,
                    isVerified: admin.isVerified || false,
                    invited_by: admin.invited_by || null,
                };
            })
        );

        // 3. Insert into DB
        const result = await Admin.insertMany(preparedAdmins, {
            ordered: false, // continue even if some fail
        });

        return res.status(201).json({
            success: true,
            message: "Bulk admin upload completed",
            insertedCount: result.length,
            data: result,
        });
    } catch (error) {
        console.error("Bulk upload error:", error);

        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Some records already exist (duplicate email found)",
                error: error.keyValue,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Bulk upload failed",
            error: error.message,
        });
    }
};


export const bulkUploadBooking = async (req, res) => {

};



