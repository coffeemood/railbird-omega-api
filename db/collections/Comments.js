const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { ID } = require('./common/datatype');

// Comments collection
const commentsCollection = new Collection('comments', { autoIncrementId: 'comments', autoIncrementPrefix: 10 });

/**
 * Comments Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const commentsSchema = {
  ownerId: String,
  entityId: ID, // Parent reference - entity which the comment relates to
  type: String,
  content: Object,
  context: Object, // { _id, content: {} }
  edited: Boolean,
};

/**
 * comments Relation Maps
 */
const commentsRelationMaps = [
];

/**
 * comments Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const commentsPublicFields = {
};

class Comments extends SuperCollection {
  constructor() {
    super(commentsCollection, commentsSchema, commentsRelationMaps, commentsPublicFields);
  }

  async getCommentsByQuery(query = {}) {
    if (!query || query.constructor !== Object) return [];
    if (Object.keys(query).length === 0) return [];
    const ratingProject = { $project: { rating: 1, _id: 0 } };
    const ratingLookup = {
      $match: {
        $expr: {
          $and: [
            { $eq: [ '$type', 'comment' ] },
            { $eq: [ '$entityId', '$$entityId' ] }
          ]
        }
      },
    };

    const data = await this.aggregate([
      { $match: query },
      // {
      //   $lookup: {
      //     from: 'ratings',
      //     let: { entityId: '$_id' },
      //     pipeline: [ ratingLookup, ratingProject ],
      //     as: 'rating',
      //   }
      // },
      // {
      //   $unwind: { path: '$rating' }
      // },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: 'user_id',
          as: 'user'
        }
      },
      {
        $project: {
          _id: 1,
          'user._id': 1,
          'user.user_id': 1,
          'user.family_name': 1,
          'user.given_name': 1,
          'user.nickname': 1,
          'user.picture': 1,
          edited: 1,
          postId: 1,
          content: 1,
          context: 1,
          rating: 1,
          createdAt: 1,
          deleted: 1,
        }
      }
    ]);

    return data;
  }
}

module.exports = new Comments();
