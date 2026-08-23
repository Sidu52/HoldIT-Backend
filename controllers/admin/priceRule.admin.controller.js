import PricingRule from "../../models/PricingRule.js";
import ServiceableArea from "../../models/ServiceableArea.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import { buildPagination } from "../../utils/helper.js";
import logger from "../../utils/logger.js";
import { PricingService } from "../../services/pricingService.js";
import Money from "../../utils/money.js";

import { createPriceRuleSchema } from "../../validations/admin/priceRule.validation.js";

// CREATE Price Rule
export const createPriceRule = async (req, res) => {
    try {
        // Validate FIRST — reject malformed payloads at the API boundary,
        // not three layers deep when a booking tries to use this rule.
        const { error, value } = createPriceRuleSchema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            return sendError(
                res,
                error.details.map((d) => d.message).join(", "),
                STATUS_CODES.BAD_REQUEST
            );
        }

        const {
            name,
            serviceAreaId,
            feeBreakdown,
            maxAdvanceDistanceKm,
            hourlyStorageRate,
            minChargeableHours,
            maxDailyRate,
            perKmRate,
            peakMultiplier,
            peakHours,
            currency,
            deactivationReason,
        } = value;

        const adminId = req.user?.auth_id;
        if (!adminId) {
            return sendError(res, "Admin identity missing from request", STATUS_CODES.UNAUTHORIZED);
        }

        const area = await ServiceableArea.findById(serviceAreaId);
        if (!area) {
            return sendError(res, "Serviceable area not found", STATUS_CODES.NOT_FOUND);
        }

        const newRuleData = {
            name,
            feeBreakdown,
            maxAdvanceDistanceKm,
            hourlyStorageRate,
            minChargeableHours,
            maxDailyRate,
            perKmRate,
            peakMultiplier,
            peakHours,
            currency,
            deactivationReason,
        };

        const rule = await PricingRule.replaceActiveRule(serviceAreaId, newRuleData, adminId);

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Price rule created and set active successfully",
            data: rule,
        });
    } catch (err) {
        logger.error("[createPriceRule] Error:", err);
        return sendError(res, "Failed to create price rule");
    }
};

// GET LIST of Price Rules
export const getPriceRules = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            serviceAreaId,
            active,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const filter = {
            ...(serviceAreaId && { serviceAreaId }),
            ...(active !== undefined && { active: active === "true" || active === true }),
        };

        const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
        const skip = (pageNum - 1) * limitNum;

        const [rules, total] = await Promise.all([
            PricingRule.find(filter)
                .populate("serviceAreaId", "name city state")
                .populate("createdBy", "name email")
                .populate("deactivatedBy", "name email")
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            PricingRule.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);

        return sendResponse({
            res,
            message: "Price rules fetched successfully",
            data: {
                rules,
                pagination: buildPagination(pageNum, limitNum, total),
            },
        });
    } catch (err) {
        logger.error("[getPriceRules] Error:", err);
        return sendError(res, "Failed to fetch price rules");
    }
};

// GET Price Rule by ID
export const getPriceRuleById = async (req, res) => {
    try {
        const { id } = req.params;
        const rule = await PricingRule.findById(id)
            .populate("serviceAreaId", "name city state")
            .populate("createdBy", "name email")
            .populate("deactivatedBy", "name email")
            .lean();

        if (!rule) {
            return sendError(res, "Price rule not found", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Price rule fetched successfully",
            data: rule,
        });
    } catch (err) {
        logger.error("[getPriceRuleById] Error:", err);
        return sendError(res, "Failed to fetch price rule");
    }
};

// GET Active Price Rule by Service Area ID
export const getActivePriceRuleByServiceArea = async (req, res) => {
    try {
        const { serviceAreaId } = req.params;
        const rule = await PricingRule.getActiveRule(serviceAreaId);

        if (!rule) {
            return sendError(res, "No active price rule found for this service area", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Active price rule fetched successfully",
            data: rule,
        });
    } catch (err) {
        logger.error("[getActivePriceRuleByServiceArea] Error:", err);
        return sendError(res, "Failed to fetch active price rule");
    }
};

// UPDATE Price Rule
export const updatePriceRule = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const adminId = req.user?.auth_id;

        const existingRule = await PricingRule.findById(id);
        if (!existingRule) {
            return sendError(res, "Price rule not found", STATUS_CODES.NOT_FOUND);
        }

        // Handle deactivation metadata if active state changes to false
        if (updates.active === false && existingRule.active === true) {
            updates.deactivatedBy = adminId;
            updates.deactivatedAt = new Date();
            if (!updates.deactivationReason) {
                updates.deactivationReason = "Updated status to inactive by admin";
            }
        }

        const updatedRule = await PricingRule.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        ).lean();

        return sendResponse({
            res,
            message: "Price rule updated successfully",
            data: updatedRule,
        });
    } catch (err) {
        if (err.code === 11000) {
            return sendError(
                res,
                "Another active pricing rule already exists for this service area",
                STATUS_CODES.CONFLICT
            );
        }
        logger.error("[updatePriceRule] Error:", err);
        return sendError(res, "Failed to update price rule");
    }
};


// DEACTIVATE Price Rule
export const deactivatePriceRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { deactivationReason } = req.body;
        const adminId = req.user?.auth_id;

        const rule = await PricingRule.findById(id);

        if (!rule) {
            return sendError(res, "Price rule not found", STATUS_CODES.NOT_FOUND);
        }

        if (!rule.active) {
            return sendError(res, "Price rule is already inactive", STATUS_CODES.BAD_REQUEST);
        }

        rule.active = false;
        rule.deactivatedBy = adminId;
        rule.deactivatedAt = new Date();
        rule.deactivationReason = deactivationReason || "Manually deactivated by admin";

        await rule.save();

        return sendResponse({
            res,
            message: "Price rule deactivated successfully",
            data: rule,
        });
    } catch (err) {
        logger.error("[deactivatePriceRule] Error:", err);
        return sendError(res, "Failed to deactivate price rule");
    }
};

// DELETE Price Rule (Hard delete)
export const deletePriceRule = async (req, res) => {
    try {
        const { id } = req.params;
        const rule = await PricingRule.findByIdAndDelete(id);

        if (!rule) {
            return sendError(res, "Price rule not found", STATUS_CODES.NOT_FOUND);
        }

        return sendResponse({
            res,
            message: "Price rule deleted successfully",
        });
    } catch (err) {
        logger.error("[deletePriceRule] Error:", err);
        return sendError(res, "Failed to delete price rule");
    }
};

// CALCULATE Price Estimate (Simulation / Preview)
export const calculatePriceEstimate = async (req, res) => {
    try {
        const { serviceAreaId, pickupLocation, storeLocation, luggage = {}, storageHours = 1 } = req.body;

        const rule = await PricingRule.getActiveRule(serviceAreaId);
        if (!rule) {
            return sendError(res, "No active price rule found for this service area", STATUS_CODES.NOT_FOUND);
        }

        const pricingSnapshot = PricingService.buildPricingSnapshot(rule, storeLocation);
        const advanceQuote = PricingService.calculateAdvanceQuote(pricingSnapshot, pickupLocation, storeLocation, luggage);

        // Estimate storage charge
        const now = new Date();
        const releaseTime = new Date(now.getTime() + storageHours * 3600000);
        const storageCharge = PricingService.calculateStorageCharge(pricingSnapshot, now, releaseTime);

        const totalEstimatedAmountMinor = Money.add(advanceQuote.totalAmountMinor, storageCharge.customerStorageFeeMinor);

        return sendResponse({
            res,
            message: "Price estimate calculated successfully",
            data: {
                currency: rule.currency || "INR",
                distanceKm: advanceQuote.distanceKm,
                advanceQuote: {
                    platformFee: Money.toMajor(advanceQuote.breakdownMinor.platformFeeMinor),
                    deliveryFee: Money.toMajor(advanceQuote.breakdownMinor.deliveryFeeMinor),
                    handlingFee: Money.toMajor(advanceQuote.breakdownMinor.handlingFeeMinor),
                    packingFee: Money.toMajor(advanceQuote.breakdownMinor.packingFeeMinor),
                    subtotal: Money.toMajor(advanceQuote.subtotalMinor),
                    taxAmount: Money.toMajor(advanceQuote.taxAmountMinor),
                    totalAmount: Money.toMajor(advanceQuote.totalAmountMinor),
                },
                storageEstimate: {
                    estimatedHours: storageHours,
                    hourlyRate: Money.toMajor(pricingSnapshot.customerStorageHourlyRateMinor),
                    estimatedFee: Money.toMajor(storageCharge.customerStorageFeeMinor),
                },
                totalEstimate: Money.toMajor(totalEstimatedAmountMinor),
                ruleDetails: {
                    ruleId: rule._id,
                    ruleName: rule.name,
                    perKmRate: rule.perKmRate,
                    maxAdvanceDistanceKm: rule.maxAdvanceDistanceKm,
                },
            },
        });
    } catch (err) {
        logger.error("[calculatePriceEstimate] Error:", err);
        return sendError(res, err.message || "Failed to calculate price estimate");
    }
};

// CLONE Price Rule
export const clonePriceRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetServiceAreaId, name } = req.body;
        const adminId = req.user?.auth_id;

        const sourceRule = await PricingRule.findById(id).lean();
        if (!sourceRule) {
            return sendError(res, "Source price rule not found", STATUS_CODES.NOT_FOUND);
        }

        const serviceAreaId = targetServiceAreaId || sourceRule.serviceAreaId;
        const ruleName = name || `${sourceRule.name} (Copy)`;

        const newRuleData = {
            name: ruleName,
            feeBreakdown: sourceRule.feeBreakdown,
            maxAdvanceDistanceKm: sourceRule.maxAdvanceDistanceKm,
            hourlyStorageRate: sourceRule.hourlyStorageRate,
            minChargeableHours: sourceRule.minChargeableHours,
            maxDailyRate: sourceRule.maxDailyRate,
            perKmRate: sourceRule.perKmRate,
            peakMultiplier: sourceRule.peakMultiplier,
            peakHours: sourceRule.peakHours,
            currency: sourceRule.currency,
            deactivationReason: `Cloned from price rule ${sourceRule.name} (${sourceRule._id})`,
        };

        const clonedRule = await PricingRule.replaceActiveRule(serviceAreaId, newRuleData, adminId);

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Price rule cloned successfully",
            data: clonedRule,
        });
    } catch (err) {
        logger.error("[clonePriceRule] Error:", err);
        return sendError(res, "Failed to clone price rule");
    }
};
