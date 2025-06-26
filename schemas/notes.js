const joi = require('joi');
const Types = require('./types');

const notesSchemas = {
  notesPATCH: joi.object().keys({
    title: Types.String,
    content: joi.object(),
    labels: joi.array(),
  }),
  notesPermissionPATCH: joi.object().keys({
    recipientIds: joi.array().has(Types.String).min(1).required(),
    access: Types.Access.required(),
  })
};

module.exports = notesSchemas;
