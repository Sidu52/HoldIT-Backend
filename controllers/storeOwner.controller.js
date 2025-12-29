import StoreOwner from "../models/StoreOwner.js";
import { sendResponse } from "../utils/apiResponse.js";

// User Update
export const updateStoreOwnerDetails = async (req, res) => {
    try {
        const { name, gender, dob, address, email } = req.body;
        const { auth_id } = req.user;

        const user = await StoreOwner.findOne({ auth_id });
        if (!user) {
            return sendResponse({ res, message: "User not found", statusCode: 404 });
        }

        Object.assign(user, { name, gender, dob, address, email,onboarding_status:"DOCUMENTS_PENDING" });
        await user.save();

        sendResponse({ res, message: "User details updated successfully" });

    } catch (err) {
        console.error(err);
        sendResponse({ res, message: "User details update failed", statusCode: 500 });
    }
};
