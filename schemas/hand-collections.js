const joi = require('joi');
const Types = require('./types');

const handCollectionSchemas = {
  collectionPOST: joi.object().keys({
    title: Types.String,
    description: joi.object(),
    hands: joi.array()
      .has(Types.IntPositive)
      .min(1)
      .max(1000)
      .required(),
  }),
  collectionHandPOST: joi.object().keys({
    hands: joi.array()
      .has(Types.IntPositive)
      .min(1)
      .max(1000)
      .required(),
  }),
  collectionPATCH: joi.object().keys({
    title: Types.String,
    description: joi.object(),
    labels: joi.array(),
  }),
  collectionPermissionPATCH: joi.object().keys({
    recipientIds: joi.array().has(Types.String).min(1).required(),
    access: Types.Access.required(),
  })
};

module.exports = handCollectionSchemas;
