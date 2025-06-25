const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// Friends collection
const friendsCollection = new Collection('friends', { autoIncrementId: 'friends', autoIncrementPrefix: 10 });

/**
 * Friends Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const friendsSchema = {
  'friend1._id': String,
  'friend1.first_name': String,
  'friend1.last_name': String,
  'friend1.picture': String,
  'friend2._id': String,
  'friend2.first_name': String,
  'friend2.last_name': String,
  'friend2.picture': String,
  sharedFiles: Array,
};

/**
 * friends Relation Maps
 */
const friendsRelationMaps = [
];

/**
 * friends Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const friendsPublicFields = {
};

class Friends extends SuperCollection {
  constructor() {
    super(friendsCollection, friendsSchema, friendsRelationMaps, friendsPublicFields);
  }

  async areFriends(first, second) {
    return this.findOneByQuery({
      'friend1._id': { $in: [ first, second ] },
      'friend2._id': { $in: [ first, second ] }
    });
  }
}

module.exports = new Friends();
