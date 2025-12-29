import Pricing from "../models/PricingRule.js";
import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";

export const updatePricing = async (req, res) => {
  const { basePickupFee, perKmRate, hourlyStorageRate, peakMultiplier } = req.body;
  try {
    await Pricing.findOneAndUpdate(
      { user_id: req.user.id },
      { $set: { basePickupFee, perKmRate, hourlyStorageRate, peakMultiplier } },
      { new: true }
    );
     sendResponse({ res, message: "Pricing details Update successfully" });
    
  } catch (error) {
    sendResponse({ res, message: "Pricing details Update failed", statusCode: STATUS_CODES.INTERNAL_SERVER_ERROR });
  }
};