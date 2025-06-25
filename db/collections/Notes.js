const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// Notes collection
const notesCollection = new Collection('notes', { autoIncrementId: 'notes', autoIncrementPrefix: 10 });

/**
 * Notes Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const noteSchema = {
  ownerId: String,
  title: String,
  content: Object,
  labels: Array, // [String]
  shares: Array, // [{ recipientId: String, access: read | write }]
};

/**
 * notes Relation Maps
 */
const notesRelationMaps = [
];

/**
 * notes Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const notesPublicFields = {
};

class Notes extends SuperCollection {
  constructor() {
    super(notesCollection, noteSchema, notesRelationMaps, notesPublicFields);
  }
}

module.exports = new Notes();
