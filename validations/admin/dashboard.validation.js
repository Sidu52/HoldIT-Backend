import Joi from "joi";

export const dashboardChartSchema = Joi.object({
    entity: Joi.string()
        .valid("booking", "user", "driver", "store")
        .default("booking")
        .messages({
            "any.only": "Entity must be one of: booking, user, driver, store",
        }),
    range: Joi.string()
        .valid("today", "week", "month", "last_3_months")
        .default("week")
        .messages({
            "any.only": "Range must be one of: today, week, month, last_3_months",
        }),
    status: Joi.string()
        .trim()
        .optional()
        .messages({
            "string.base": "Status filter must be a string",
        }),
});