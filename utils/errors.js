class BadRequestError extends Error {}

const errorHandler = (err, req, res, next) => {
  if (err.status === 404) {
    res.status(err.status).json({ status: 'error', message: 'Endpoint Does Not Exist' });
  } else if (err instanceof BadRequestError) {
    res.status(400).json({ status: 'error', message: err.message });
  } else {
    res.status(err.status || 500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

module.exports = {
  BadRequestError,
  errorHandler
};
