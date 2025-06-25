/* eslint-disable no-underscore-dangle */
const router = require('express').Router();
const moment = require('moment');
const _ = require('lodash');
const { generateHash } = require('random-hash');
const Hands = require('../db/collections/Hands');
const Friends = require('../db/collections/Friends');
const Posts = require('../db/collections/Posts');
const validator = require('../utils/validator');
const handSchemas = require('../schemas/hands');
const { analyzePokerHand } = require('../utils/analysis');
const FileUploads = require('../db/collections/FileUploads');
const Users = require('../db/collections/Users');
const pusher = require('../utils/pusher');

const potSizesRules = {
  '0-10bb': { $lte: 10 },
  '10-20bb': { $gte: 10, $lte: 20 },
  '20-30bb': { $gte: 20, $lte: 30 },
  '30-50bb': { $gte: 30, $lte: 50 },
  '50-100bb': { $gte: 50, $lte: 100 },
  '100+bb': { $gte: 100 },
};

const potTypesRules = {
  '3bp': [ '3bp' ],
  '4bp': [ '4bp' ],
  '5bp': [ '5bp' ],
  aipf: [ 'aipf' ],
  limped: [ 'limped' ],
  srp: [ 'srp', '2bp' ],
};

const textureRule = (textures) => {
  const textureMap = [
    { type: 'rainbow', field: 'isRainbow' },
    { type: 'monotone', field: 'isMonoTone' },
    { type: 'twotone', field: 'isTwoTones' },
    { type: 'broadway', field: 'isBroadway' },
    { type: '3ofakind', field: 'isThreeOfAKind' },
    { type: 'paired', field: 'isPaired' }
  ];

  if (textures && textures.length) {
    return {
      $or: textures.map((texture) => ({
        [`info.${textureMap.find(t => t.type === texture).field}`]: true
      }))
    };
  }
  return {};
};

router.get(
  '/v1/posts/:id/hands',
  async (req, res) => {
    const postId = req.params.id;
    const pageSize = +(req.query.pageSize || 20);
    const pageNumber = +(req.query.pageNumber || 1);
    const viewingOption = req.query.viewingOption || 'all';
    const isNoteVisible = req.query.isNoteVisible === 'true';
    const { handId } = req.query;

    const data = await Posts.findById(+postId);
    if (!data) return res.status(400).json({ message: 'Invalid Post' });
    const { entityId } = data;

    const fileUpload = await FileUploads.findOneByQuery({ _id: entityId });
    if (!fileUpload) return res.status(400).json({ message: 'Invalid Post' });

    const { _id } = fileUpload;

    try {
      const aggregation = [
        {
          $match: {
            sourceFile: _id,
            ...(handId ? { _id: +handId } : {}),
          },
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
            actionScript: 1,
            playerChips: 1,
            totalPot: 1,
            spoilers: 1,
            posts: 1,
            preflopActions: 1,
            board: 1,
            analysis: 1,
            ...(isNoteVisible ? { notes: 1 } : {})
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

      const totalPages = Math.ceil(hands.total / pageSize);

      return res.status(200).json({
        success: true,
        data: {
          pageData: hands.pageData,
          total: hands.total,
          totalPages,
          currentPage: hands.pageNumber
        }
      });
    } catch (error) {
      console.error('Error fetching session hands:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

router.post(
  '/v1/hands/:id/analyze',
  async (req, res) => {
    try {
      const ownerId = Account.userId();
      const _id = +req.params.id;

      // Find the hand and verify ownership
      const hand = await Hands.findOneByQuery({ _id, ownerId });
      if (!hand) {
        return res.status(400).json({ message: 'Invalid hand or unauthorized access' });
      }

      const balance = await Users.findOneByQuery({ user_id: ownerId });
      if (balance.coins < 1) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      if (balance.email_verified === false) {
        return res.status(400).json({ message: 'Please verify your email to continue' });
      }

      // if (!_.get(hand, 'info.sawFlop', false)) {
      //   return res.status(400).json({ message: 'We only support post-flop analysis for now. Please try another hand.' });
      // }

      const foundFile = await FileUploads.findOneByQuery({ _id: hand.sourceFile, ownerId });
      if (!foundFile) {
        return res.status(400).json({ message: 'Invalid hand or unauthorized access' });
      }

      // Perform hand analysis
      const analysis = await analyzePokerHand(hand, 'openai');
      // const analysis = await analyzePokerHand(hand, 'mistral');
      let parsed = {};

      // Remove markdown code block formatting and parse JSON
      try {
        const cleanAnalysis = analysis.replace(/```json\n|\n```/g, '');
        parsed = JSON.parse(cleanAnalysis);
      } catch (error) {
        console.error('Error parsing analysis:', error);
        parsed = {
          tlDr: 'Analysis unavailable due to error',
          keyDecisions: [],
          considerations: [ 'Analysis skipped - please try again later' ],
          confidenceScore: 0
        };
      }
      // Update the hand with analysis results
      await Hands.updateByQuery(
        { _id, ownerId },
        { analysis: parsed }
      );

      const updatedCoins = balance.coins ? balance.coins - 1 : 0;
      await Users.updateByQuery(
        { user_id: ownerId },
        { coins: updatedCoins }
      );

      await pusher.trigger(`user-${balance._id}`, 'coin-update', {
        newBalance: updatedCoins
      });

      return res.status(200).json({
        status: 'success',
        data: parsed
      });
    } catch (error) {
      console.error('Error analyzing hand:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to analyze hand'
      });
    }
  }
);

router.post('/v1/hands/my-hands/chart-data',
  async (req, res) => {
    const { criteria, session } = req.body;
    const {
      gameType, dateRange
    } = criteria;
    const [ fromTimeStamp, toTimeStamp ] = dateRange || [];

    // Might need to change this to date played instead of date uploaded
    const dateRangeLookup = fromTimeStamp && toTimeStamp
      ? {
        $gte: fromTimeStamp,
        $lte: toTimeStamp
      } : { $exists: true };

    let gameTypeFilter = { $exists: true };
    if (gameType === 'Cash') gameTypeFilter = 'cashgame';
    if (gameType === 'MTT') gameTypeFilter = 'tournament';

    const aggregation = [
      {
        $match: {
          'header.gametype': gameTypeFilter,
          ownerId: Account.userId(),
          createdAt: dateRangeLookup,
          sourceFile: session ? session._id : { $exists: true },
        }
      },
      {
        $addFields: {
          heroChip: {
            $filter: {
              input: '$playerChips',
              as: 'player',
              cond: { $eq: [ '$$player.hero', true ] }
            },
          }
        }
      },
      {
        $project: {
          _id: 0,
          heroChip: 1,
          info: 1,
        }
      }
    ];

    const data = await Hands.aggregate(aggregation);
    const winningTrend = data.reduce((acc, hand) => {
      const { heroChip } = hand;
      const winLossBB = _.get(heroChip, '[0].winLossBB', 0);
      const winLossBBPrev = acc.length > 0 ? acc[acc.length - 1] : 0;
      const winLoss = winLossBBPrev + winLossBB;
      return [ ...acc, winLoss ];
    }, []);
    const showdownTrend = data.reduce((acc, hand) => {
      const { heroChip, info } = hand;
      const winLossBB = _.get(heroChip, '[0].winLossBB', 0);
      const { sawShowdown } = info || {};
      const showdownBB = sawShowdown ? winLossBB : 0;
      const showdownBBPrev = acc.length > 0 ? acc[acc.length - 1] : 0;
      const showdown = showdownBBPrev + showdownBB;
      return [ ...acc, showdown ];
    }, []);
    const nonShowdownTrend = data.reduce((acc, hand) => {
      const { heroChip, info } = hand;
      const winLossBB = _.get(heroChip, '[0].winLossBB', 0);
      const { sawShowdown } = info || {};
      const nonShowdownBB = sawShowdown ? 0 : winLossBB;
      const nonShowdownBBPrev = acc.length > 0 ? acc[acc.length - 1] : 0;
      const nonShowdown = nonShowdownBBPrev + nonShowdownBB;
      return [ ...acc, nonShowdown ];
    }, []);

    return res.json({
      winningTrend,
      showdownTrend,
      nonShowdownTrend,
    });
  });

router.post('/v1/hands/my-hands/chart-data-by-session',
  async (req, res) => {
    const { session } = req.body;
    const aggregation = [
      {
        $match: {
          ownerId: Account.userId(),
          sourceFile: session || { $exists: false },
        }
      },
      {
        $addFields: {
          heroChip: {
            $filter: {
              input: '$playerChips',
              as: 'player',
              cond: { $eq: [ '$$player.hero', true ] }
            },
          }
        }
      },
      {
        $project: {
          _id: 0,
          heroChip: 1,
          info: 1,
        }
      }
    ];
    const data = await Hands.aggregate(aggregation);
    const winningTrend = data.reduce((acc, hand) => {
      const { heroChip } = hand;
      const winLossBB = _.get(heroChip, '[0].winLossBB', 0);
      const winLossBBPrev = acc.length > 0 ? acc[acc.length - 1] : 0;
      const winLoss = winLossBBPrev + winLossBB;
      return [ ...acc, winLoss ];
    }, []);
    const showdownTrend = data.reduce((acc, hand) => {
      const { heroChip, info } = hand;
      const winLossBB = _.get(heroChip, '[0].winLossBB', 0);
      const { sawShowdown } = info || {};
      const showdownBB = sawShowdown ? winLossBB : 0;
      const showdownBBPrev = acc.length > 0 ? acc[acc.length - 1] : 0;
      const showdown = showdownBBPrev + showdownBB;
      return [ ...acc, showdown ];
    }, []);
    const nonShowdownTrend = data.reduce((acc, hand) => {
      const { heroChip, info } = hand;
      const winLossBB = _.get(heroChip, '[0].winLossBB', 0);
      const { sawShowdown } = info || {};
      const nonShowdownBB = sawShowdown ? 0 : winLossBB;
      const nonShowdownBBPrev = acc.length > 0 ? acc[acc.length - 1] : 0;
      const nonShowdown = nonShowdownBBPrev + nonShowdownBB;
      return [ ...acc, nonShowdown ];
    }, []);

    const statistics = await FileUploads.getSessionStatistics(session);

    return res.json({
      winningTrend,
      showdownTrend,
      nonShowdownTrend,
      statistics,
    });
  });

router.post(
  '/v1/hands/my-hands',
  async (req, res) => {
    const pageSize = +req.body.pageSize;
    const pageNumber = +req.body.pageNumber;
    const { criteria, presets, session } = req.body;
    const {
      dateRange,
    } = criteria;
    const {
      selectedPos,
      selectedPotSizes,
      selectedPotTypes,
      selectedHighCards,
      selectedTextures,
      winningSort,
      gameType,
      vpipOnly,
      hasNotes,
    } = presets || {
      gameType: 'all',
      vpipOnly: false,
      winningSort: 'default',
      hasNotes: 'default',
      selectedPos: [],
      selectedPotSizes: [],
      selectedPotTypes: [],
      selectedTextures: [],
      selectedHighCards: []
    };

    const [ fromTimeStamp, toTimeStamp ] = dateRange || [];

    // Might need to change this to date played instead of date uploaded
    const dateRangeLookup = fromTimeStamp && toTimeStamp
      ? {
        $gte: fromTimeStamp,
        $lte: toTimeStamp
      } : { $exists: true };

    let gameTypeFilter;
    if (gameType === 'cash') { gameTypeFilter = 'cashgame'; } else if (gameType === 'mtt') { gameTypeFilter = 'tournament'; } else gameTypeFilter = { $exists: true };

    const aggregation = [
      {
        $match: {
          'header.gametype': gameTypeFilter,
          ownerId: Account.userId(),
          createdAt: dateRangeLookup,
          'info.isVPIP': vpipOnly ? true : { $exists: true },
          sourceFile: session ? session._id : { $exists: true },
          ...textureRule(selectedTextures),
          'info.highestCard': selectedHighCards && selectedHighCards.length > 0 ? { $in: selectedHighCards } : { $exists: true },
        }
      },
    ];

    if (selectedPos.length) {
      aggregation.push({
        $match: { 'info.heroPos': { $in: selectedPos.map(p => p.toUpperCase()) } }
      });
    }

    if (selectedPotSizes.length) {
      const rule = { $or: selectedPotSizes.map(potSize => ({ 'totalPot.bb': potSizesRules[potSize] })) };
      aggregation.push({
        $match: rule
      });
    }

    if (selectedPotTypes.length) {
      const rule = { $or: selectedPotTypes.map(potType => ({ 'info.potType': { $in: potTypesRules[potType] } })) };
      aggregation.push({
        $match: rule
      });
    }

    let sortOption = {
      'header.timestamp': -1,
    };

    if (winningSort === 'top') {
      sortOption = { 'info.heroWinningBB': -1 };
    } else if (winningSort === 'bottom') {
      sortOption = { 'info.heroWinningBB': 1 };
    } else if (winningSort === 'latestPlayed') {
      sortOption = { 'header.timestamp': -1 };
    } else if (winningSort === 'earliestPlayed') {
      sortOption = { 'header.timestamp': 1 };
    } else if (winningSort === 'latestUploaded') {
      sortOption = { createdAt: -1 };
    } else if (winningSort === 'earliestUploaded') {
      sortOption = { createdAt: 1 };
    }

    if (hasNotes === 'has notes') {
      aggregation.push({
        $match: { notes: { $exists: true, $not: { $size: 0 } } }
      });
    } else if (hasNotes === 'no notes') {
      aggregation.push({
        $match: { notes: { $size: 0 } }
      });
    }

    if ([ 'top', 'bottom', 'latestPlayed', 'earliestPlayed', 'latestUploaded', 'earliestUploaded' ].includes(winningSort)) {
      aggregation.push({
        $sort: sortOption
      });
    }

    const hands = await Hands.aggregateWithPagination(
      aggregation,
      pageNumber,
      pageSize,
      { sort: sortOption }
    );

    const totalPages = Math.ceil(hands.total / pageSize);
    res.status(200).json({ status: 'success', data: { ...hands, totalPages } });
  }
);

router.post(
  '/v1/hands/my-hands/sessions/data-table',
  async (req, res) => {
    const { criteria } = req.body;
    const { gameType, dateRange } = criteria;

    console.log(Account.userId());

    const [ fromTimeStamp, toTimeStamp ] = dateRange || [];
    // Might need to change this to date played instead of date uploaded
    const dateRangeLookup = fromTimeStamp && toTimeStamp
      ? {
        $gte: fromTimeStamp,
        $lte: toTimeStamp
      } : { $exists: true };

    let gameTypeLookup;
    if (gameType === 'cashgame') gameTypeLookup = 'cashgame';
    else if (gameType === 'tournament') gameTypeLookup = 'tournament';
    else gameTypeLookup = { $exists: true };

    const aggregation = [
      {
        $match: {
          'header.gametype': gameTypeLookup,
          ownerId: Account.userId(),
          createdAt: dateRangeLookup,
        }
      },
      // Add hero net winnings calculation
      {
        $unwind: '$playerChips'
      },
      {
        $group: {
          _id: {
            sourceFile: '$sourceFile',
            isHero: '$playerChips.hero'
          },
          count: { $sum: 1 },
          netWon: {
            $sum: {
              $cond: [
                '$playerChips.hero',
                '$playerChips.winLossBB',
                0
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: '$_id.sourceFile',
          count: {
            $sum: {
              $cond: [
                { $eq: [ '$_id.isHero', true ] },
                '$count',
                0
              ]
            }
          },
          netWon: { $sum: '$netWon' }
        }
      },
      // Continue with existing pipeline
      {
        $lookup: {
          from: 'file-uploads',
          localField: '_id',
          foreignField: '_id',
          as: 'file'
        }
      },
      {
        $unwind: '$file'
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$$ROOT',
              '$file'
            ]
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ];

    console.log(JSON.stringify(aggregation, null, 2));

    const sortOption = { createdAt: -1 };
    const pageSize = +req.body.pageSize;
    const pageNumber = +req.body.pageNumber;

    const sessions = await Hands.aggregateWithPagination(
      aggregation,
      pageNumber,
      pageSize,
      { sort: sortOption }
    );

    console.log({
      metadata: sessions.metadata,
      total: sessions.total,
      pageNumber: sessions.pageNumber,
      pageSize: sessions.pageSize,
    });

    const totalPages = Math.ceil(sessions.total / pageSize);

    res.status(200).json({ status: 'success', data: { ...sessions, totalPages } });
  }
);

router.post(
  '/v1/hands',
  validator(handSchemas.handsPOST, 'body'),
  async (req, res) => {
    const { hands } = req.body;
    const ownerId = Account.userId();
    await Hands.insertMany(hands.map(h => ({ ...h, ownerId, privacy: 'private' })));
    res.status(200).json({ status: 'success' });
  }
);

router.delete(
  '/v1/hands',
  validator(handSchemas.handsDELETE, 'body'),
  async (req, res) => {
    const { hands } = req.body;
    const ownerId = Account.userId();
    const found = await Hands.findByQuery({ ownerId, _id: { $in: hands } });
    if (found.length !== hands.length) return res.status(400).json({ message: 'Invalid hands supplied' });
    await Hands.deleteByQuery({ ownerId, _id: { $in: hands } });
    return res.status(200).json({ status: 'success' });
  }
);

router.get(
  '/v1/hands/:id',
  async (req, res) => {
    const id = +req.params.id;
    const ownerId = Account.userId();
    const hand = await Hands.getHandDetailById(id, ownerId);
    if (hand) return res.status(200).json({ hand });
    return res.status(400).json({ message: 'You do not have the permission to view this hand' });
  }
);

router.patch(
  '/v1/hands/:id',
  validator(handSchemas.handsPATCH, 'body'),
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const update = Hands.toMongoSetObject(req.body);
    const { matchedCount } = await Hands.updateByQuery({ _id, ownerId }, update);
    if (!matchedCount) return res.status(400).json({ message: 'Invalid hand' });
    return res.status(200).json({ status: 'success' });
  }
);

router.post(
  '/v1/hands/:id/notes',
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const found = await Hands.findOneByQuery({ _id, ownerId });
    if (!found) return res.status(400).json({ message: 'Invalid hand' });
    const { note } = req.body;
    const newNote = {
      _id: generateHash({ length: 14 }),
      note,
      ownerId,
      name: Account.userName(),
      createdAt: moment().valueOf()
    };

    await Hands.updateRawByQuery({
      _id,
      ownerId
    }, {
      $push: {
        notes: newNote
      }
    });
    return res.status(200).json({ status: 'success', data: newNote });
  }
);

router.delete(
  '/v1/hands/:id/notes/:noteId',
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const found = await Hands.findOneByQuery({ _id, ownerId });
    if (!found) return res.status(400).json({ message: 'Invalid hand' });
    const { noteId } = req.params;
    await Hands.updateRawByQuery({
      _id,
      ownerId
    }, {
      $pull: {
        notes: {
          _id: noteId
        }
      }
    });
    return res.status(200).json({ status: 'success' });
  }
);

router.put(
  '/v1/hands/:id/notes/:noteId',
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const found = await Hands.findOneByQuery({ _id, ownerId });
    if (!found) return res.status(400).json({ message: 'Invalid hand' });
    const { noteId } = req.params;
    const { note } = req.body;
    await Hands.updateRawByQuery({
      _id,
      ownerId,
      'notes._id': noteId
    }, {
      $set: {
        'notes.$.note': note.note,
        'notes.$.edited': true,
        'notes.$.updatedAt': moment().valueOf()
      }
    });
    return res.status(200).json({ status: 'success' });
  }
);

router.get(
  '/v1/hands/my-hands/leaks',
  async (req, res) => {
    try {
      const ownerId = Account.userId();
      const { position } = req.query;
      const leaks = await Hands.getVPIPLeaksByPosition(ownerId);
      const groupedHands = await Hands.getGroupByHoleCards(ownerId, position || false);

      return res.status(200).json({
        success: true,
        data: {
          leaks,
          groupedHands
        }
      });
    } catch (error) {
      console.error('Error fetching VPIP leaks:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

router.post(
  '/v1/hands/my-hands/range-analysis',
  async (req, res) => {
    try {
      const ownerId = Account.userId();
      const { position, mistake } = req.body;
      const parseBoolean = (value) => value === 'true';
      const groupedHands = await Hands.getGroupByHoleCards(ownerId, position || false);

      return res.status(200).json({
        success: true,
        data: {
          groupedHands
        }
      });
    } catch (error) {
      console.error('Error fetching VPIP leaks:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router;
