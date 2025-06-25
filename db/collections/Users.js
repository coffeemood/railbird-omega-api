const { Timestamp } = require('mongodb');
const e = require('express');
const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const Hands = require('./Hands');
const FileUploads = require('./FileUploads');
const Posts = require('./Posts');
const Comments = require('./Comments');
const Ratings = require('./Ratings');

// Users collection
const userCollection = new Collection('users', {
  autoIncrementId: 'users',
  autoIncrementPrefix: 10,
});

/**
 * Users Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const userschema = {
  user_id: String,
  app_metadata: Object,
  email: String,
  email_verified: Boolean,
  family_name: String,
  given_name: String,
  name: String,
  nickname: String,
  description: String,
  phone_number: String,
  phone_verified: Boolean,
  picture: String,
  banner: String,
  coverPicture: String,
  username: String,
  last_login: Timestamp,
  coins: Number,
  completedQuests: Array,
  claimedQuests: Array,
};

/**
 * Users Relation Maps
 */
const usersRelationMaps = [
  // TODO: Update Friend-Requests + Friends collection embedding
];

/**
 * Users Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const usersPublicFields = {
};

class Users extends SuperCollection {
  constructor() {
    super(userCollection, userschema, usersRelationMaps, usersPublicFields);
  }

  async findByUserId(id) {
    const user = await this.findOneByQuery({ user_id: id });
    return user;
  }
}

module.exports = new Users();
