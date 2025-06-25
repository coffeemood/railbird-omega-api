const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
// const { ID } = require('./common/datatype');

// Notifications collection
const notificationsCollection = new Collection('notifications', { autoIncrementId: 'notifications', autoIncrementPrefix: 10 });

/**
 * Notifications Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const notificationsSchema = {
  senderId: String,
  ownerId: String,
  content: String,
  type: String,
  entityType: String,
  entityId: Number,
  parentEntityType: String,
  parentEntityId: Number,
  handId: Number,
  title: String,
  url: String,
  commentId: Number, // only for comment notifications
  isRead: Boolean,
  parentPost: Number,
};

/**
 * notifications Relation Maps
 */
const notificationsRelationMaps = [
];

/**
 * notifications Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const notificationsPublicFields = {
};

class Notifications extends SuperCollection {
  constructor() {
    super(notificationsCollection, notificationsSchema, notificationsRelationMaps, notificationsPublicFields);
  }
}

module.exports = new Notifications();
