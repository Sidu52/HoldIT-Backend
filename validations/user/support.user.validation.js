import Joi from "joi";
import {
    TICKET_CATEGORY,
    TICKET_PRIORITY,
    TICKET_STATUS,
} from "../../utils/constants.js";
import { SUPPORT_LIMITS } from "../../constants/user/support.js";

const attachmentSchema = Joi.object({
    url: Joi.string().uri().max(500).required().messages({
        "string.uri": "Attachment URL must be a valid URI",
        "any.required": "Attachment URL is required",
    }),
    fileName: Joi.string().trim().max(200).required().messages({
        "any.required": "File name is required",
    }),
    fileType: Joi.string().trim().max(50).required().messages({
        "any.required": "File type is required",
    }),
});

const ticketIdParamSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid ticket ID format",
            "any.required": "Ticket ID is required",
        }),
});

export const createTicketSchema = {
    body: Joi.object({
        subject: Joi.string()
            .trim()
            .min(5)
            .max(SUPPORT_LIMITS.MAX_SUBJECT_LENGTH)
            .required()
            .messages({
                "string.min": "Subject must be at least 5 characters",
                "string.max": `Subject cannot exceed ${SUPPORT_LIMITS.MAX_SUBJECT_LENGTH} characters`,
                "any.required": "Subject is required",
            }),
        category: Joi.string()
            .valid(...Object.values(TICKET_CATEGORY))
            .required()
            .messages({
                "any.only": `Category must be one of: ${Object.values(TICKET_CATEGORY).join(", ")}`,
                "any.required": "Category is required",
            }),
        priority: Joi.string()
            .valid(...Object.values(TICKET_PRIORITY))
            .optional()
            .default(TICKET_PRIORITY.MEDIUM)
            .messages({
                "any.only": `Priority must be one of: ${Object.values(TICKET_PRIORITY).join(", ")}`,
            }),
        message: Joi.string()
            .trim()
            .min(10)
            .max(SUPPORT_LIMITS.MAX_MESSAGE_LENGTH)
            .required()
            .messages({
                "string.min": "Message must be at least 10 characters",
                "string.max": `Message cannot exceed ${SUPPORT_LIMITS.MAX_MESSAGE_LENGTH} characters`,
                "any.required": "Message is required",
            }),
        bookingId: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .optional()
            .allow(null)
            .messages({
                "string.pattern.base": "Invalid booking ID format",
            }),
        attachments: Joi.array()
            .items(attachmentSchema)
            .max(SUPPORT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE)
            .optional()
            .default([])
            .messages({
                "array.max": `Maximum ${SUPPORT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed`,
            }),
    }),
};

export const listTicketsSchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(10),
        status: Joi.string()
            .valid(...Object.values(TICKET_STATUS))
            .optional()
            .messages({
                "any.only": "Invalid ticket status filter",
            }),
        sort_order: Joi.string()
            .valid("asc", "desc")
            .default("desc"),
    }),
};

export const ticketIdSchema = {
    params: ticketIdParamSchema,
};

export const replyToTicketSchema = {
    params: ticketIdParamSchema,
    body: Joi.object({
        message: Joi.string()
            .trim()
            .min(1)
            .max(SUPPORT_LIMITS.MAX_MESSAGE_LENGTH)
            .required()
            .messages({
                "string.min": "Message cannot be empty",
                "string.max": `Message cannot exceed ${SUPPORT_LIMITS.MAX_MESSAGE_LENGTH} characters`,
                "any.required": "Message is required",
            }),
        attachments: Joi.array()
            .items(attachmentSchema)
            .max(SUPPORT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE)
            .optional()
            .default([])
            .messages({
                "array.max": `Maximum ${SUPPORT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed`,
            }),
    }),
};