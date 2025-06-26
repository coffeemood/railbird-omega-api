const joi = require('joi');
const Types = require('./types');

const postsSchemas = {
  postsPOST: joi.object().keys({
    type: Types.PostType,
    title: Types.StringEmpty,
    entityId: Types.IntPositive,
    description: joi.object(),
    content: joi.object(),
    hand: joi.object(),
    category: Types.StringEmpty,
    gametype: Types.StringEmpty,
    isNoteVisible: Types.Boolean,
    tags: // array of strings
      joi.array().items(Types.StringEmpty),
  }),
  postsPATCH: joi.object().keys({
    title: Types.String,
    description: joi.object(),
    content: joi.object(),
    privacy: Types.Privacy,
  })
};

module.exports = postsSchemas;
