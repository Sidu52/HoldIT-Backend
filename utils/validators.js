// /utils/validators.js

/**
 * Validate if a string is a valid email address
 * @param {string} email - Email string
 * @returns {boolean}
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate if a file is of a valid type (image, pdf, etc.)
 * @param {string} mimeType - MIME type of the file
 * @returns {boolean}
 */
const validateFileType = (mimeType) => {
  const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  return validTypes.includes(mimeType);
};

export { validateEmail, validateFileType };