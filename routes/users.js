/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
const router = require('express').Router();
const { generateHash } = require('random-hash');
const { ObjectId } = require('mongodb');
const Users = require('../db/collections/Users');
const Ratings = require('../db/collections/Ratings');
const Posts = require('../db/collections/Posts');
const Votes = require('../db/collections/Votes');
const Comments = require('../db/collections/Comments');
const Hands = require('../db/collections/Hands');
const s3Helper = require('../utils/s3');
const FileUploads = require('../db/collections/FileUploads');

router.get('/v1/my-profile',
  async (req, res) => {
    const user = Account.user();
    return res.status(200).json({ status: 'success', data: user, preferences: user.preferences });
  });

router.get('/v1/users/:userId',
  async (req, res) => {
    const { userId } = req.params;
    const objectId = new ObjectId(userId);
    const user = await Users.findOneByQuery(
      // user ObjectId
      { _id: objectId },
      {
        projection: {
          family_name: 1,
          given_name: 1,
          nickname: 1,
          picture: 1,
          user_id: 1,
          _id: 1,
          createdAt: 1,
          banner: 1,
          description: 1,
        }
      }
    );
    return res.status(200).json({ status: 'success', data: user });
  });

// PUT /v1/my-preferences accept { key, value }
router.put('/v1/my-preferences',
  async (req, res) => {
    const { key, value } = req.body;
    const user = Account.user();
    const { preferences } = user || {};
    const newPreferences = { ...preferences, [key]: value };
    await Users.findOneAndUpdate({ _id: user._id }, { $set: { preferences: newPreferences } });
    return res.status(200).json({ status: 'success', preferences: newPreferences });
  });

// GET /v1/my-preferences
router.get('/v1/my-preferences',
  async (req, res) => {
    const user = Account.user();
    const { preferences } = user || {};
    return res.status(200).json({ status: 'success', preferences });
  });

router.patch('/v1/my-profile',
  async (req, res) => {
    // allow update first name, last name and description
    const user = Account.user();
    const withoutNull = Object.fromEntries(Object.entries(req.body).filter(([ _, v ]) => v != null));
    const update = Users.toMongoSetObject(withoutNull);
    await Users.updateById(user._id, update);
    const updated = await Users.findById(user._id);
    return res.status(200).json({ status: 'success', data: updated });
  });

/*
 * @oas [post] /v1/my-profile/presigned-url?type=
 * description: get upload url signature
 * query:
 *      type: String,
 */
router.post(
  '/v1/my-profile/presigned-url',
  async (req, res) => {
    const { type, fileName, isPublic } = req.body;
    const Bucket = process.env.AWS_BUCKET;
    const postfix = fileName.split('.')[fileName.split('.').length - 1];
    const originalname = fileName.split('.')[0];
    const name = `${originalname}-${generateHash({ length: 17 })}`;
    const Key = `${type}/${name}.${postfix}`;

    const options = {};
    if (isPublic) {
      Object.assign(options, {
        ACL: 'public-read'
      });
    }
    const url = await s3Helper.getSignedUrlPUT(Bucket, Key, null, options);
    return res.status(200).json({ status: 'success', data: { url, name: `${name}.${postfix}` } });
  }
);

router.post('/v1/users', async (req, res) => {
  const { user } = req.body;

  try {
    await Users
      .updateRawByQuery({ email: user.email }, { $set: { ...user } }, { upsert: true });

    return res.status(200).json({ status: 'success', message: 'ngoan x2' });
  } catch (e) {
    Logger.error(e);
    return res.status(400).json({ message: e });
  }
});

/**
 * @api {get} railbird/v1/users/${this.userId}/reputation
 * Get user reputation
 */
router.get('/v1/users/:userId/reputation', async (req, res) => {
  // eslint-disable-next-line camelcase
  const { userId } = req.params;

  const user = await Users.findByQuery({ user_id: userId });
  if (!user) return res.status(400).json({ message: 'Invalid user' });
  // destructure user
  const [ userObj ] = user;

  const ratings = await Ratings.aggregate([
    { $match: { ownerId: userId } },
    // sum value of each rating
    { $group: { _id: '$ownerId', total: { $sum: '$rating' } } }
  ]);
  const noReputation = ratings.length ? ratings[0].total : 0;
  const noPosts = await Posts.collection.countDocuments({ ownerId: userId });
  const noSessionsUploaded = await FileUploads.collection.countDocuments({ ownerId: userId });
  const noHandUploaded = await Hands.collection.countDocuments({ ownerId: userId });

  const userDetails = {
    ...userObj,
    noReputation,
    noPosts,
    noSessionsUploaded,
    noHandUploaded,
  };
  return res.status(200).json({ status: 'success', data: userDetails });
});

router.get('/v1/my-stats',
  async (req, res) => {
    const ownerId = Account.userId();

    try {
      // Get hands uploaded count
      const handsUploaded = await Hands.countByQuery({ ownerId });

      // Get hands analyzed count
      const handsAnalyzed = await Hands.countByQuery({
        ownerId,
        analysis: { $exists: true }
      });

      const fileUploads = await FileUploads.countByQuery({ ownerId });

      const comments = await Comments.countByQuery({ ownerId });

      // Get posts count
      const posts = await Posts.countByQuery({ ownerId });

      const ratings = await Ratings.aggregate([
        { $match: { ownerId } },
        // sum value of each rating
        { $group: { _id: '$ownerId', total: { $sum: '$rating' } } }
      ]);
      const upvotes = ratings.length ? ratings[0].total : 0;


      return res.status(200).json({
        status: 'success',
        data: {
          stats: {
            handsUploaded,
            handsAnalyzed,
            fileUploads,
            comments,
            posts,
            upvotes,
          }
        }
      });
    } catch (error) {
      console.error('Error getting user stats:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve user stats'
      });
    }
  });

module.exports = router;
