const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// Categories collection
const categoriesCollection = new Collection('categories', { autoIncrementId: 'categories', autoIncrementPrefix: 10 });

/**
 * Categories Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const categoriesSchema = {
  name: String,
  description: String,
};

/**
 * categories Relation Maps
 */
const categoriesRelationMaps = [
];

/**
 * categories Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const categoriesPublicFields = {
};

class Categories extends SuperCollection {
  constructor() {
    super(categoriesCollection, categoriesSchema, categoriesRelationMaps, categoriesPublicFields);
  }
}

module.exports = new Categories();
