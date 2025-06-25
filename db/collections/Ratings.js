const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { ID, Int } = require('./common/datatype');

// ratings collection
const ratingsCollection = new Collection('ratings', { autoIncrementId: 'ratings', autoIncrementPrefix: 10 });

/**
 * ratings Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const ratingsSchema = {
  ownerId: String,
  entityId: ID,
  type: String, // hand / post / comment / quick-hand
  value: Int,
};

/**
 * ratings Relation Maps
 */
const ratingsRelationMaps = [
];

/**
 * ratings Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const ratingsPublicFields = {
};

class Ratings extends SuperCollection {
  constructor() {
    super(ratingsCollection, ratingsSchema, ratingsRelationMaps, ratingsPublicFields);
  }
}

module.exports = new Ratings();
