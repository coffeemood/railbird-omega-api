const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// solves collection
const solvesCollection = new Collection('solves', { autoIncrementId: 'solves', autoIncrementPrefix: 10 });

/**
 * solves Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const solvesSchema = {
// TBA
};

/**
 * solves Relation Maps
 */
const solvesRelationMaps = [
];

/**
 * solves Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const solvesPublicFields = {
};

class Solves extends SuperCollection {
  constructor() {
    super(solvesCollection, solvesSchema, solvesRelationMaps, solvesPublicFields);
  }
}

module.exports = new Solves();
