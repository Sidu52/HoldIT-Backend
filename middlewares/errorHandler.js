// /middlewares/errorHandler.js

/**
 * Centralized error handler for Express
 * @param {Object} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const errorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log the error stack to the console for debugging

  // Send a generic error response
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    data: null,
  });
};

export default errorHandler;