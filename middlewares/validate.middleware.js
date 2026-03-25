import { sendResponse } from "../utils/apiResponse.js";
import { STATUS_CODES } from "../utils/constants.js";
import logger from "../utils/logger.js";



export const validate = (schema, source = null) => {
    return (req, res, next) => {
        if (source && typeof schema.validate === "function") {
            return validateSingle(req, res, next, schema, source);
        }
        if (typeof schema === "object" && !schema.validate) {
            return validateMultiple(req, res, next, schema);
        }
        if (typeof schema.validate === "function") {
            return validateSingle(req, res, next, schema, "body");
        }
        logger.error("[Validate] Invalid schema format passed to validate()");
        return next();
    };
};


function validateSingle(req, res, next, schema, source) {
    const dataToValidate = req[source];

    const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        return sendValidationError(res, error);
    }

    // Store validated data
    if (!req.validated) req.validated = {};
    req.validated[source] = value;

    // Also update original source for convenience
    if (source === "query") {
    Object.assign(req.query, value);
} else {
    req[source] = value;
}

    next();
}

function validateMultiple(req, res, next, schemaMap) {
    if (!req.validated) req.validated = {};

    for (const [source, schema] of Object.entries(schemaMap)) {
        if (!["body", "params", "query"].includes(source)) continue;
        if (!schema || typeof schema.validate !== "function") continue;

        const dataToValidate = req[source];

        const { error, value } = schema.validate(dataToValidate, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            return sendValidationError(res, error);
        }

        req.validated[source] = value;
       if (source === "query") {
    Object.assign(req.query, value);
} else {
    req[source] = value;
}
    }

    next();
}

function sendValidationError(res, error) {
    const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message.replace(/"/g, ""),
    }));

    return sendResponse({
        res,
        message: "Validation failed",
        statusCode: STATUS_CODES.BAD_REQUEST,
        data: { errors },
    });
}