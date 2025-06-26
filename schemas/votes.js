const joi = require('joi');
const Types = require('./types');

const votesSchemas = {
  votesPOST: joi.object().keys({
    type: Types.VoteType,
    entityId: Types.ID,
    parentEntityId: joi.any(),
    parentEntityType: joi.any(),
    handId: joi.any(),
    value: joi
      .number()
      .min(-1).max(1)
      .required()
      .strict(),
  })
};

module.exports = votesSchemas;
