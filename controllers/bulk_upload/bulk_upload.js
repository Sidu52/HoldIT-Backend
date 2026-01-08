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

};


export const bulkUploadStore = async (req, res) => {

};


export const bulkUploadAdmin = async (req, res) => {

};

export const bulkUploadBooking = async (req, res) => {

};



