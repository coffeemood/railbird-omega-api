const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { ID, Int } = require('./common/datatype');

// Votes collection
const votesCollection = new Collection('votes', { autoIncrementId: 'votes', autoIncrementPrefix: 10 });

/**
 * Votes Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const votesSchema = {
  ownerId: String,
  entityId: ID,
  type: String, // hand / post / comment / quick-hand
  value: Int,
};

/**
 * Votes Relation Maps
 */
const votesRelationMaps = [
];

/**
 * Votes Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const votesPublicFields = {
};

class Votes extends SuperCollection {
  constructor() {
    super(votesCollection, votesSchema, votesRelationMaps, votesPublicFields);
  }
}

module.exports = new Votes();
