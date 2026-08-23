import Joi from "joi";

export const sendManualPushSchema = Joi.object({
    title: Joi.string().trim().min(2).max(200).required().messages({
        "string.empty": "Title is required",
        "string.max": "Title cannot exceed 200 characters",
    }),
    body: Joi.string().trim().min(2).max(1000).required().messages({
        "string.empty": "Message body is required",
        "string.max": "Message body cannot exceed 1000 characters",
    }),
    targetAudience: Joi.string()
        .valid(
            "ALL_USERS",
            "ALL_DRIVERS",
            "ALL_ONLINE_DRIVERS",
            "ALL_ACTIVE_USERS",
            "SPECIFIC_USER",
            "SPECIFIC_DRIVER",
            "BROADCAST_ALL"
        )
        .required(),
    targetRecipientId: Joi.string().optional().allow(null, ""),
    screen: Joi.string().trim().optional().default("home"),
    customData: Joi.object().optional().default({}),
    priority: Joi.string().valid("default", "normal", "high").optional().default("high"),
    sound: Joi.string().valid("default", "none").optional().default("default"),
});
