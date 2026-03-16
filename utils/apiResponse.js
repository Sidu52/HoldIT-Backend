
/**
 * Format and send API responses
 * @param {Object} res - Express response object
 * @param {Object} data - Data to be sent as response
 * @param {number} statusCode - HTTP status code (default 200)
 * @param {string} message - Response message (optional)
 */
 export const sendResponse = ({ res, data = null, statusCode = 200, message = null }) => {
  const response = {
    success: true,
    status: statusCode,
    message: message || (statusCode < 400 ? 'Request was successful' : 'An error occurred'),
    data: data || null,
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
};

/**
 * Send API error response
 * @param {Object} res - Express response object
 * @param {Error} error - Error object or message
 * @param {number} statusCode - HTTP status code (default 500)
 */
 export const sendError = (res, error, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    status: statusCode,
    message: error?.message || error,
    data: null,
    timestamp: new Date().toISOString(),
  });
};

