import Joi from "joi";

export const coordinatesSchema = Joi.array()
    .items(Joi.number())
    .length(2)
    .custom((value, helpers) => {
        const [lng, lat] = value;
        if (lng < -180 || lng > 180) {
            return helpers.error("any.invalid", {
                message: "Longitude must be between -180 and 180",
            });
        }
        if (lat < -90 || lat > 90) {
            return helpers.error("any.invalid", {
                message: "Latitude must be between -90 and 90",
            });
        }
        return value;
    })
    .messages({
        "array.length": "Coordinates must have exactly [longitude, latitude]",
    });

export const addAddressSchema = Joi.object({
    street: Joi.string().trim().required().messages({
        "string.empty": "Street is required",
    }),
    city: Joi.string().trim().required().messages({
        "string.empty": "City is required",
    }),
    state: Joi.string().trim().required().messages({
        "string.empty": "State is required",
    }),
    postal_code: Joi.string().trim().required().messages({
        "string.empty": "Postal code is required",
    }),
    country: Joi.string().trim().required().messages({
        "string.empty": "Country is required",
    }),
    coordinates: coordinatesSchema.optional(),
    is_default: Joi.boolean().optional(),
});

export const updateAddressSchema = Joi.object({
    street: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    state: Joi.string().trim().optional(),
    postal_code: Joi.string().trim().optional(),
    country: Joi.string().trim().optional(),
    coordinates: coordinatesSchema.optional(),
    is_default: Joi.boolean().optional(),
}).min(1).messages({
    "object.min": "At least one field must be provided for update",
});
