import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURATION & VALIDATION
const { EMAIL_USER, EMAIL_PASS, EMAIL_FROM, NODE_ENV } = process.env;

if (!EMAIL_USER || !EMAIL_PASS) {
  throw new Error(
    "Email configuration missing: EMAIL_USER and EMAIL_PASS are required"
  );
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Verify connection on startup
transporter.verify().then(() => {
  logger.info("Email service ready");
}).catch((err) => {
  logger.error("Email service failed to initialize:", err.message);
});


// TEMPLATE CACHE & RENDERING
const templateCache = new Map();

const escapeHtml = (str) => {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const loadTemplate = async (templateName) => {
  // Return cached version if available
  if (templateCache.has(templateName) && NODE_ENV === "production") {
    return templateCache.get(templateName);
  }

  const templatePath = path.join(
    __dirname,
    "../email-templates",
    templateName
  );

  // Prevent directory traversal
  const resolvedPath = path.resolve(templatePath);
  const templatesDir = path.resolve(
    path.join(__dirname, "../email-templates")
  );

  if (!resolvedPath.startsWith(templatesDir)) {
    throw new Error("Invalid template path");
  }

  try {
    const template = await fs.readFile(resolvedPath, "utf-8");
    templateCache.set(templateName, template);
    return template;
  } catch (err) {
    throw new Error(`Email template not found: ${templateName}`);
  }
};

const renderTemplate = async (templateName, data = {}, rawFields = []) => {
  let template = await loadTemplate(templateName);

  for (const key in data) {
    const escapedKey = escapeRegex(key);
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, "g");

    // Some fields should NOT be escaped
    const value = rawFields.includes(key)
      ? String(data[key])
      : escapeHtml(data[key]);

    template = template.replace(regex, value);
  }

  // Remove any unreplaced placeholders
  template = template.replace(/{{\s*\w+\s*}}/g, "");

  return template;
};

// SEND EMAIL
/**
 * Send an email using a template
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template filename
 * @param {Object} options.data - Dynamic data for template
 * @param {string[]} options.rawFields - Fields that should NOT be HTML-escaped (e.g., URLs)
 * @returns {Promise<Object>} - Nodemailer response
 */
const sendEmail = async ({
  to,
  subject,
  template,
  data = {},
  rawFields = [],
}) => {
  // Input validation
  if (!to || !subject || !template) {
    throw new Error(
      "Missing required email fields: to, subject, template"
    );
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    throw new Error(`Invalid email address: ${to}`);
  }

  try {
    const htmlContent = await renderTemplate(template, data, rawFields);

    const mailOptions = {
      from: EMAIL_FROM || `"App Name" <${EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);

    if (NODE_ENV !== "production") {
      logger.info(`📧 Email sent to ${to}: ${info.messageId}`);
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error.message);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

export default sendEmail;