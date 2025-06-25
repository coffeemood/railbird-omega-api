const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// HandCollections collection
const handCollectionsCollection = new Collection('hand-collections', { autoIncrementId: 'hand-collections', autoIncrementPrefix: 10 });

/**
 * HandCollections Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const handCollectionsSchema = {
  ownerId: String,
  title: String,
  description: Object,
  labels: Array, // [String]
  shares: Array, // [{ recipientId: String, access: read | write }]
};

/**
 * handCollections Relation Maps
 */
const handCollectionsRelationMaps = [
];

/**
 * handCollections Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const handCollectionsPublicFields = {
};

class HandCollections extends SuperCollection {
  constructor() {
    super(handCollectionsCollection, handCollectionsSchema, handCollectionsRelationMaps, handCollectionsPublicFields);
  }
}

module.exports = new HandCollections();
