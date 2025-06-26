const joi = require('joi');
const Types = require('./types');

const friendsSchemas = {
  friendRequestPOST: joi.object().keys({
    recipientId: Types.String,
    action: joi.string().valid('request', 'cancel').required(),
  }),
  friendRequestPATCH: joi.object().keys({
    action: joi.string().valid('accept', 'delete').required(),
  })
};

module.exports = friendsSchemas;
