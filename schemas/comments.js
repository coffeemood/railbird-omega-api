const joi = require('joi');
const Types = require('./types');

const commentsSchemas = {
  commentsPOST: joi.object().keys({
    context: joi.object(),
    content: Types.Content,
    type: Types.CommentType,
    parentEntityId: joi.any(),
    parentEntityType: joi.any(),
    handId: joi.any(),
    entityId: Types.ID, // Parent reference - entity which the comment relates to
    // postId: Types.ID, // Post reference for permission check
  }),
  commentsPUT: joi.object().keys({
    context: joi.object(),
    content: Types.Content,
  }),
};

module.exports = commentsSchemas;
