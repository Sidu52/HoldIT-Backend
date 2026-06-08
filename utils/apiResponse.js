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

export const sendError = (res, error, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    status: statusCode,
    message: error?.message || error,
    data: null,
    timestamp: new Date().toISOString(),
  });
};

