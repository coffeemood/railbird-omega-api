const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { ID, Int } = require('./common/datatype');

// subscribers collection
const subscribersCollection = new Collection('subscribers', { autoIncrementId: 'subscribers', autoIncrementPrefix: 10 });

/**
 * subscribers Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const subscribersSchema = {
  email: String,
};

/**
 * subscribers Relation Maps
 */
const subscribersRelationMaps = [
];

/**
 * subscribers Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const subscribersPublicFields = {
};

class Subscribers extends SuperCollection {
  constructor() {
    super(subscribersCollection, subscribersSchema, subscribersRelationMaps, subscribersPublicFields);
  }
}

module.exports = new Subscribers();
