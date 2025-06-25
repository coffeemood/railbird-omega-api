const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const Friends = require('./Friends');
const Hands = require('./Hands');
const FileUploads = require('./FileUploads');
const { ID } = require('./common/datatype');

// Posts collection
const postsCollection = new Collection('posts', { autoIncrementId: 'posts', autoIncrementPrefix: 10 });

/**
 * Posts Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const postsSchema = {
  ownerId: String,
  entityId: ID,
  title: String,
  type: String, // hand, file
  description: Object,
  content: Object, // tiptap JSON
  hand: Object, // for hand posts
  tags: Array,
  room: String,
  sb: Number,
  bb: Number,
  gametype: String,
  buyin: Number,
  currency: String,
  noHands: Number,
  category: String,
  isNoteVisible: Boolean,
  privacy: String, // public, social, private
};

/**
 * posts Relation Maps
 */
const postsRelationMaps = [
];

/**
 * posts Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const postsPublicFields = {
};

class Posts extends SuperCollection {
  constructor() {
    super(postsCollection, postsSchema, postsRelationMaps, postsPublicFields);
  }

  async getPostPermission(userId, postId) {
    const post = await this.findById(postId, { _id: 1, ownerId: 1, privacy: 1 });
    if (!post) return false;
    const { ownerId, privacy } = post;
    if (ownerId !== userId) {
      if (privacy === 'private') return false;
      if (privacy === 'social') {
        const isFriend = await Friends.areFriends(ownerId, userId);
        if (!isFriend) return false;
      }
    }
    return true;
  }

  async getPostsWithDetails(ids) {
    if (!ids.length) return [];
    // const ratingProject = { $project: { rating: 1, _id: 0 } };
    // const ratingLookup = {
    //   $match: {
    //     $expr: {
    //       $and: [
    //         { $eq: [ '$type', 'post' ] },
    //         { $eq: [ '$entityId', '$$entityId' ] }
    //       ]
    //     }
    //   },
    // };

    const aggregation = [
      { $match: { _id: { $in: ids } } },
      // {
      //   $lookup: {
      //     from: 'ratings',
      //     let: { entityId: '$_id' },
      //     pipeline: [
      //       ratingLookup,
      //       ratingProject
      //     ],
      //     as: 'rating',
      //   }
      // },
      // {
      //   $unwind: { path: '$rating', preserveNullAndEmptyArrays: true }
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
        $unwind: { path: '$user', preserveNullAndEmptyArrays: true }
      },
      {
        $lookup: {
          from: 'file-uploads',
          localField: 'entityId',
          foreignField: '_id',
          as: 'file'
        }
      },
      {
        $unwind: { path: '$file', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          _id: 1,
          ownerId: 1,
          numberOfHands: 1,
          'user._id': 1,
          'user.user_id': 1,
          'user.family_name': 1,
          'user.given_name': 1,
          'user.nickname': 1,
          'user.picture': 1,
          'user.created_at': 1,
          entityId: 1,
          title: 1,
          type: 1,
          hand: 1,
          noHands: 1,
          gametype: 1,
          description: 1,
          content: 1,
          category: 1,
          tags: 1,
          privacy: 1,
          isNoteVisible: 1,
          rating: 1,
          deleted: 1,
          createdAt: 1,
          'file.summary': 1,
          'file._id': 1,
          'file.netWon': 1,
        }
      },
    ];

    const data = await this.aggregate(aggregation);
    if (!data.length) return [];
    // const [ found ] = data;
    // const { type, deleted, entityId } = found;

    // If post is deleted, don't do any further aggregation
    // if (deleted) return found;

    // if (type === 'hand') {
    //   const hand = await Hands.getHandDetailById(id);
    //   found.hand = hand;
    // }

    // if (type === 'file') {
    //   const fileUpload = await FileUploads.findOneByQuery({ _id: entityId });
    //   if (!fileUpload) return [];
    //   const { sourceFile } = fileUpload;
    //   const hands = await Hands.findByQuery({ sourceFile });
    //   return hands;
    // }

    // return found;
    return data;
  }

  async getPostWithDetails(id) {
    const data = await this.getPostsWithDetails([ id ]);
    if (!data.length) return [];
    const [ post ] = data;

    if (post.type === 'session') {
      const fileUpload = await FileUploads.findOneByQuery({ _id: post.entityId });
      if (!fileUpload) return [];
      // const { _id } = fileUpload;
      // const hands = await Hands.aggregate([
      //   { $match: { sourceFile: _id } },
      //   {
      //     $project: {
      //       ownerId: 1,
      //       privacy: 1,
      //       preflopSummary: 1,
      //       flopSummary: 1,
      //       turnSummary: 1,
      //       riverSummary: 1,
      //       info: 1,
      //       indexInCollection: 1,
      //       header: 1,
      //       actionScript: 1,
      //       playerChips: 1,
      //       totalPot: 1,
      //       spoilers: 1,
      //       posts: 1,
      //       preflopActions: 1,
      //       board: 1,
      //       ...(post.isNoteVisible ? { notes: 1 } : {})
      //     }
      //   },
      //   {
      //     $lookup: {
      //       from: 'ratings',
      //       let: { entityId: '$_id' },
      //       pipeline: [
      //         {
      //           $match: {
      //             $expr: {
      //               $and: [
      //                 { $eq: [ '$type', 'hand' ] },
      //                 { $eq: [ '$entityId', '$$entityId' ] }
      //               ]
      //             },
      //           }
      //         },
      //         { $project: { rating: 1, _id: 0 } }
      //       ],
      //       as: 'rating',
      //     }
      //   },
      //   {
      //     $unwind: { path: '$rating', preserveNullAndEmptyArrays: true }
      //   },
      //   {
      //     $sort: { indexInCollection: 1 }
      //   }
      // ]);
      // post.hands = hands;
    }
    return post;
  }
}

module.exports = new Posts();
