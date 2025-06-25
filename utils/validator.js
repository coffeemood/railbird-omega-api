/**
//  * Validator middleware - Using Joi schemas
//  *
//  * @param {object} schema: Schema used to validate current route
//  * @param {string} property: Property of the request validate - body / query / params
//  */
const validator = (schema, property) => (req, res, next) => {
  const { error } = schema.validate(req[property]);
  const valid = error == null;
  if (valid) { next(); } else {
    const { details } = error;
    const message = details.map(i => i.message).join(',');
    console.log('error', message);
    res.status(422).json({ error: message });
  }
};

module.exports = validator;
