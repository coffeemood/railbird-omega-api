/* eslint-disable no-underscore-dangle */
const router = require('express').Router();
const moment = require('moment');
const s3 = require('../utils/s3');
const FileUploads = require('../db/collections/FileUploads');
const Hands = require('../db/collections/Hands');
const Users = require('../db/collections/Users');
const { generateHandTitles, storeHandTitles } = require('../services/titleGenerationService');
/* -- File Uploads schema --
  ownerId: String,
  fileName: String,
  title: String,
  description: String,
  tags: Array, // array of strings
  privacy: String, // private, social, public -- This is used for sharable links
  noHands: Number,
  playedOn: String,
  room: String,
  gameType: String,
  createdAt: Number,
  status: String, // pending, uploading, failed, processing, processed
  meta: Object,
*/

/* Upload flow --

1. Prepare sessions on the front end, request api
2. API create sessions and return session ids + s3 presigned urls
3. Front end finishes upload and update session with status processing
4. Hand parser lambda updates session with status processed or failed

*/

const exampleSessions = [ 10750 ];

router.post(
  '/v1/sessions',
  async (req, res) => {
    const { files } = req.body;
    const ownerId = Account.userId();

    const user = await Users.findOneByQuery({ user_id: ownerId });
    if (user.email_verified === false) {
      return res.status(400).json({ status: 'error', message: 'Please verify your email to continue' });
    }

    const fileNames = files.map((file) => file.fileName);
    const existingFiles = await FileUploads.findByQuery({ fileName: { $in: fileNames }, ownerId, status: 'processed' });
    const existingFileNames = existingFiles.map((file) => file.fileName);
    const newFiles = files.filter((file) => !existingFileNames.includes(file.fileName));
    if (!newFiles.length) return res.status(400).json({ status: 'error', message: 'These files are already uploaded to your library' });

    const inserts = newFiles.map(async (file) => ({
      _id: await FileUploads.collection.getAutoIncrementId('sessions'),
      ownerId,
      ...FileUploads.toMongoInsertObject(file),
      status: 'pending',
      analyze: file.analyze,
      createdAt: moment().valueOf(),
    }));
  
    const ids = await FileUploads.insertMany(inserts);
    const insertedFiles = await FileUploads.findByQuery({ _id: { $in: ids } });
    const data = await Promise.all(insertedFiles.map(async (file) => {
      const key = `${file._id}`;
      const url = await s3.getSignedUrlPUT(process.env.HAND_BUCKET, key);
      return {
        ...file,
        url,
      };
    }));

    return res.status(200).json({ status: 'success', data });
  }
);

router.put(
  '/v1/sessions/:id',
  async (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    const ownerId = Account.userId();
    const file = await FileUploads.findByQuery({
      _id: +id,
      ownerId,
    });
    if (!file) return res.status(404).json({ status: 'error', message: 'File not found' });
    if (file.status !== 'pending') return res.status(400).json({ status: 'error', message: 'File is not pending' });
    await FileUploads.updateOne({ _id: +id, ownerId }, { status });
    return res.status(200).json({ status: 'success' });
  }
);

router.post(
  '/v1/sessions/data-table',
  async (req, res) => {
    const pageSize = +req.body.pageSize;
    const pageNumber = +req.body.pageNumber;
    const ownerId = Account.userId();
    const fileUploads = await FileUploads.findByQueryWithPagination( // query, pageNumber, pageSize, options = {}
      { ownerId, status: { $ne: 'pending' } },
      pageNumber,
      pageSize,
      {
        sort: { sessionStart: -1 },
      }
    );

    const { total, pageData } = fileUploads;
    const totalPages = Math.ceil(total / pageSize);

    for (let i = 0; i < pageData.length; i++) {
      const session = pageData[i];
      const stats = await FileUploads.getSessionStatistics(session._id);
      pageData[i] = {
        ...session,
        ...stats,
      };
    }

    const data = {
      pageData,
      total,
      totalPages,
    };

    return res.status(200).json({ status: 'success', ...data });
  }
);

router.get(
  '/v1/sessions/:id',
  async (req, res) => {
    const _id = +req.params.id;
    const ownerId = Account.userId();
    if (exampleSessions.includes(_id)) {
      const fileUpload = await FileUploads.findOneByQuery({ _id, ownerId: { $exists: true } });
      // Get session progression data
      const progression = await FileUploads.getSessionProgression(_id);
      return res.status(200).json({ 
        status: 'success', 
        fileUpload: {
          ...fileUpload,
          progression
        }
      });
    }
    const fileUpload = await FileUploads.findOneByQuery({ _id, ownerId });
    if (!fileUpload) return res.status(400).json({ message: 'We could not find the requested file' });
    
    // Get session progression data
    const progression = await FileUploads.getSessionProgression(_id);
    
    return res.status(200).json({ 
      status: 'success', 
      fileUpload: {
        ...fileUpload,
        progression
      }
    });
  }
);

router.get(
  '/v1/sessions/:id/hands',
  async (req, res) => {
    const _id = +req.params.id;
    const pageSize = +(req.query.pageSize || 20);
    const pageNumber = +(req.query.pageNumber || 1);
    const viewingOption = req.query.viewingOption || 'all';
    const isNoteVisible = req.query.isNoteVisible === 'true';
    const ownerId = Account.userId();

    const foundUpload = await FileUploads.findOneByQuery({ _id });
    if (!foundUpload) return res.status(400).json({ message: 'We could not find the requested file' });

    const { playerStats } = foundUpload;

    try {
      const aggregation = [
        {
          $match: {
            sourceFile: _id,
            ownerId: exampleSessions.includes(_id) ? { $exists: true } : ownerId
          }
        },
        {
          $project: {
            ownerId: 1,
            privacy: 1,
            preflopSummary: 1,
            flopSummary: 1,
            turnSummary: 1,
            riverSummary: 1,
            info: 1,
            indexInCollection: 1,
            header: 1,
            notes: 1,
            actionScript: 1,
            playerChips: 1,
            totalPot: 1,
            spoilers: 1,
            posts: 1,
            preflopActions: 1,
            board: 1,
            analysis: 1,
          }
        },
        {
          $lookup: {
            from: 'ratings',
            let: { entityId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: [ '$type', 'hand' ] },
                      { $eq: [ '$entityId', '$$entityId' ] }
                    ]
                  },
                }
              },
              { $project: { rating: 1, _id: 0 } }
            ],
            as: 'rating',
          }
        },
        {
          $unwind: { path: '$rating', preserveNullAndEmptyArrays: true }
        }
      ];

      // Add viewing option filters
      if (viewingOption === 'vpip') {
        aggregation.push({
          $match: { 'info.isVPIP': true }
        });
      } else if (viewingOption === 'key') {
        aggregation.push({
          $match: { 'info.isKeyHand': true }
        });
      }

      // Sort by index in collection
      aggregation.push({
        $sort: { indexInCollection: 1 }
      });

      const hands = await Hands.aggregateWithPagination(
        aggregation,
        pageNumber,
        pageSize,
        { sort: { indexInCollection: 1 } }
      );

      const enhancedPageData = playerStats ? hands.pageData.map((hand) => {
        const enhancedPlayerChips = hand.playerChips.map((chip) => {
          const { name } = chip;
          const playerStat = playerStats.find((stat) => stat.name === name);
          return {
            ...chip,
            ...playerStat
          };
        });
        return {
          ...hand,
          playerChips: enhancedPlayerChips
        };
      }) : hands.pageData;

      const totalPages = Math.ceil(hands.total / pageSize);

      return res.status(200).json({
        status: 'success',
        data: {
          pageData: enhancedPageData,
          total: hands.total,
          totalPages,
          currentPage: hands.pageNumber
        }
      });
    } catch (error) {
      console.error('Error fetching session hands:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
);

router.delete(
  '/v1/sessions/:id',
  async (req, res) => {
    const _id = +req.params.id;
    const ownerId = Account.userId();
    const fileUpload = await FileUploads.findOneByQuery({ _id, ownerId });
    if (!fileUpload) return res.status(400).json({ message: 'We could not find the requested file' });
    await FileUploads.deleteByQuery({ _id, ownerId });
    const handCount = await Hands.countByQuery({ ownerId, sourceFile: _id });
    await Hands.deleteByQuery({ ownerId, sourceFile: _id });
    return res.status(200).json({ status: 'success', data: { handCount } });
  }
);

// Test endpoint for section 1.3 - Title Generation
router.post(
  '/v1/sessions/:id/generate-titles',
  async (req, res) => {
    try {
      const sessionId = +req.params.id;
      const { modelType = 'cerebras', limit = 10 } = req.body;
      const ownerId = Account.userId();

      // Verify session exists and user has access
      const session = await FileUploads.findOneByQuery({ 
        _id: sessionId, 
        ownerId: exampleSessions.includes(sessionId) ? { $exists: true } : ownerId 
      });
      
      if (!session) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Session not found or access denied' 
        });
      }

      // Get hands from the session (limited for testing)
      const hands = await Hands.findByQuery(
        { 
          sourceFile: sessionId,
          'info.isVPIP': true,
          ownerId: exampleSessions.includes(sessionId) ? { $exists: true } : ownerId
        },
        { 
          limit: Math.min(limit, 20), // Cap at 20 for testing
          sort: { indexInCollection: 1 }
        }
      );

      if (!hands || hands.length === 0) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'No hands found in this session' 
        });
      }

      console.log(`Generating titles for ${hands.length} hands from session ${sessionId} using ${modelType}`);

      // Generate titles using the service
      const handTitles = await generateHandTitles(hands, modelType);

      // Store titles in database
      await storeHandTitles(handTitles);

      return res.status(200).json({
        status: 'success',
        data: {
          sessionId,
          handCount: hands.length,
          titles: handTitles,
          modelUsed: modelType
        },
        message: `Successfully generated ${handTitles.length} hand titles`
      });

    } catch (error) {
      console.error('Error in generate-titles endpoint:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error while generating titles',
        error: error.message
      });
    }
  }
);

module.exports = router;
