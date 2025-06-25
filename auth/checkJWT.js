const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const dotenv = require('dotenv');

dotenv.config();

const audience = process.env.AUTH0_AUDIENCE;
const jwtMiddleware = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  }),
  audience,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});

// Create checkJwt with custom unless functionality
const checkJwt = (req, res, next) => {
  return jwtMiddleware(req, res, next);
};

// Add custom unless method
checkJwt.unless = (options) => {
  return (req, res, next) => {
    // Check if current path should be excluded
    if (options.path && options.path.includes(req.path)) {
      return next(); // Skip JWT check
    }
    // Otherwise, apply JWT middleware
    return jwtMiddleware(req, res, next);
  };
};

module.exports = {
  checkJwt,
};
