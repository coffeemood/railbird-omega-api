const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// Friend Requests collection
const friendRequestsCollection = new Collection('friend-requests', { autoIncrementId: 'friend-requests', autoIncrementPrefix: 10 });

/**
 * Friend Requests Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const friendRequestsSchema = {
  requesterId: String,
  recipientId: String,
  status: String,
};

/**
 * friendRequests Relation Maps
 */
const friendRequestsRelationMaps = [
];

/**
 * friendRequests Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const friendRequestsPublicFields = {
};

class FriendRequests extends SuperCollection {
  constructor() {
    super(friendRequestsCollection, friendRequestsSchema, friendRequestsRelationMaps, friendRequestsPublicFields);
  }
}

module.exports = new FriendRequests();
