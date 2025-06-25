const cache = require('memory-cache');
const Collection = require('../collection');
const { ID } = require('./common/datatype');
const SuperCollection = require('./common/supercollection');
const Friends = require('./Friends');
const { processHands } = require('../../utils/hand-parser');
const s3 = require('../../utils/s3');

const memCache = new cache.Cache();
// const { ID } = require('./common/datatype');

// Hands collection
const handsCollection = new Collection('hands', { autoIncrementId: 'hands', autoIncrementPrefix: 10 });

// create indexes
// handsCollection.collection.createIndex({ ownerId: 1 });
// handsCollection.collection.createIndex({ 'header.timestamp': 1 });
// handsCollection.collection.createIndex({ createdAt: 1 });
// handsCollection.collection.createIndex({
//   'info.heroWinningBB': 1
// });

/**
 * Hands Schema - Custom schema to be applied to Collection.toMongoInsertObject method
 */
const handsSchema = {
  ownerId: String,
  entityId: ID,
  privacy: String, // private, social, public -- This is used for sharable links
  type: String, // post / collection (used to look up from collection)
  preflopSummary: Object, // { cards: { card1, card2 }, pos, heroPreflopSummary }
  flopSummary: Object, // { pot, potBB, board, playersInvolved, heroFlopSummary }
  turnSummary: Object, // { pot, potBB, board, playersInvolved, heroTurnSummary }
  riverSummary: Object, // { pot, potBB, board, playersInvolved, heroRiverSummary }
  info: Object, // { potType, effStack, isVPIP, isHero3B, isHero4B, isHero5B, sawFlop, sawTurn, sawRiver, sawShowdown, heroSeatIndex }
  notes: Object, // TipTap JSON object
  // notes: [] Array of notes TipTap objects
  header: Object, // { room, gametype, currency, donation, rake, pokertype, limit, sb, bb, ante, maxseats }
  actionScript: Array,
  /* {
    _id, // ! Generated upon import for context inside comments
    action: {
      type,
      pot,
      potAfter,
      chips,
      chipsAfter,
      bet,
      chipsInFront,
      ratio,
      allin,
      amount,
      winall,
    },
    playerIndex,
    street,
  }
  */
  playerChips: Array,
  /* {
    pos,
    name,
    chips,
    chipsAfter,
    bb,
    bbAfter,
    winLoss,
    winLossBB,
    hero
  }
  */
  analysis: Object, // { tlDr, mistakes: [], considerations: [], villainProfile, handScore, streetComments: { flop: [], turn: [], river: [] } }
  totalPot: Object, // { amount, bb }
  spoilers: Array, // { pos, cards: { card1, card2 }}
  posts: Array, // { name, amount, type, playerIndex, chips, chipsAfter }
  preflopActions: Array, // { type, number, pos, amountBB, amount }
  publishedAt: Number, // Timestamp
  indexInCollection: Number, // Index of hand in collection
};

/**
 * Hands Relation Maps
 */
const handsRelationMaps = [
];

/**
 * Hands Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const handsPublicFields = {
};

class Hands extends SuperCollection {
  constructor() {
    super(handsCollection, handsSchema, handsRelationMaps, handsPublicFields);
  }

  async getHandWithPermissions(id, requesterId) {
    const hand = await this.findById(id);
    if (!hand) {
      throw new Error('Hand not found');
    }
    const { privacy, indexInCollection, sourceFile } = hand;

    if (privacy === 'private' && hand.ownerId !== requesterId) return false;
    if (privacy === 'social' && !hand.ownerId) {
      const isFriend = await Friends.areFriends(requesterId, Account.userId());
      if (!isFriend) return false;
    }

    // TODO: Switch to redis
    let s3File = memCache.get(sourceFile);
    if (!s3File) {
      s3File = await s3.getDocument(process.env.HAND_BUCKET, sourceFile);
      if (!s3File) {
        throw new Error('Hand not found');
      }
      memCache.put(sourceFile, s3File, 1000 * 60 * 60 * 24);
    }

    const fileString = s3File.Body.toString('utf8');
    const parsedFile = processHands(fileString);
    const parsedHand = parsedFile[indexInCollection];
    return { ...hand, ...parsedHand };
  }

  async getHandDetailById(id) {
    const hand = await this.findById(id);
    // if (!hand) {
    //   throw new Error('Hand not found');
    // }
    // const { indexInCollection, sourceFile } = hand;
    // let s3File = memCache.get(sourceFile);
    // if (!s3File) {
    //   s3File = await s3.getDocument(process.env.HAND_BUCKET, sourceFile);
    //   if (!s3File) {
    //     throw new Error('Hand not found');
    //   }
    //   memCache.put(sourceFile, s3File, 1000 * 60 * 60 * 24);
    // }

    // const fileString = s3File.Body.toString('utf8');
    // const parsedFile = processHands(fileString);
    // const parsedHand = parsedFile[indexInCollection];
    // return { ...hand, ...parsedHand };
    return hand;
  }

  async getVPIPLeaksByPosition(ownerId) {
    const pipeline = [
      // First get all hands to calculate base stats
      {
        $facet: {
          vpipHands: [
            // VPIP hands with mistakes analysis
            {
              $match: {
                ownerId,
                'info.isVPIP': true,
                'analysis.mistakes': { $exists: true, $ne: [] }
              }
            },
            {
              $unwind: '$analysis.mistakes'
            },
            {
              $group: {
                _id: {
                  position: '$preflopSummary.pos',
                  severityBucket: {
                    $switch: {
                      branches: [
                        { case: { $lte: [ '$analysis.mistakes.severity', 20 ] }, then: '0-20' },
                        { case: { $lte: [ '$analysis.mistakes.severity', 40 ] }, then: '21-40' },
                        { case: { $lte: [ '$analysis.mistakes.severity', 60 ] }, then: '41-60' },
                        { case: { $lte: [ '$analysis.mistakes.severity', 80 ] }, then: '61-80' },
                        { case: { $lte: [ '$analysis.mistakes.severity', 100 ] }, then: '81-100' }
                      ],
                      default: '100+'
                    }
                  }
                },
                mistakeCount: { $sum: 1 },
                vpipHandIds: { $addToSet: '$_id' },
                mistakes: {
                  $push: {
                    severity: '$analysis.mistakes.severity',
                    description: '$analysis.mistakes.error',
                    street: '$analysis.mistakes.street',
                    winningBB: '$info.heroWinningBB',
                  }
                },
              }
            }
          ],
          positionStats: [
            // All hands for position stats
            {
              $match: { ownerId }
            },
            {
              $group: {
                _id: '$preflopSummary.pos',
                totalHands: { $sum: 1 },
                vpipHands: {
                  $sum: { $cond: [ '$info.isVPIP', 1, 0 ] }
                },
                totalWinningBB: { $sum: '$info.heroWinningBB' }
              }
            }
          ]
        }
      },
      // Unwind and group VPIP hands by position
      {
        $project: {
          combined: {
            $map: {
              input: '$positionStats',
              as: 'pos',
              in: {
                position: '$$pos._id',
                totalHands: '$$pos.totalHands',
                vpipHands: '$$pos.vpipHands',
                vpipPercentage: {
                  $round: [
                    {
                      $multiply: [
                        { $divide: [ '$$pos.vpipHands', '$$pos.totalHands' ] },
                        100
                      ]
                    },
                    1
                  ]
                },
                avgWinningBB: {
                  $round: [
                    { $divide: [ '$$pos.totalWinningBB', '$$pos.totalHands' ] },
                    2
                  ]
                },
                avgWinningBBPer100: {
                  $round: [
                    {
                      $multiply: [
                        { $divide: [ '$$pos.totalWinningBB', '$$pos.totalHands' ] },
                        100
                      ]
                    },
                    2
                  ]
                },
                severityDistribution: {
                  $filter: {
                    input: '$vpipHands',
                    as: 'vpip',
                    cond: { $eq: [ '$$vpip._id.position', '$$pos._id' ] }
                  }
                }
              }
            }
          }
        }
      },
      // Unwind and reshape the final output
      {
        $unwind: '$combined'
      },
      {
        $project: {
          position: '$combined.position',
          totalHands: '$combined.totalHands',
          vpipHands: '$combined.vpipHands',
          vpipPercentage: '$combined.vpipPercentage',
          avgWinningBB: '$combined.avgWinningBB',
          avgWinningBBPer100: '$combined.avgWinningBBPer100',
          avgSeverity: {
            $round: [
              {
                $avg: {
                  $reduce: {
                    input: '$combined.severityDistribution',
                    initialValue: [],
                    in: {
                      $concatArrays: [
                        '$$value',
                        {
                          $map: {
                            input: '$$this.mistakes',
                            as: 'mistake',
                            in: '$$mistake.severity'
                          }
                        }
                      ]
                    }
                  }
                }
              },
              1
            ]
          },
          severityDistribution: {
            $map: {
              input: '$combined.severityDistribution',
              as: 'dist',
              in: {
                severityRange: '$$dist._id.severityBucket',
                count: '$$dist.mistakeCount',
                mistakes: '$$dist.mistakes',
                percentageOfVPIPHands: {
                  $round: [
                    {
                      $multiply: [
                        { $divide: [ '$$dist.mistakeCount', '$combined.vpipHands' ] },
                        100
                      ]
                    },
                    1
                  ]
                }
              }
            }
          }
        }
      },
      // Sort by position
      {
        $sort: { position: 1 }
      }
    ];

    return this.aggregate(pipeline);
  }

  async getGroupByHoleCards(ownerId, position = false, mistakes = true) {
    const pipeline = [
      {
        $facet: {
          hands: [
            {
              $match: {
                ownerId,
                'info.isVPIP': true,
                ...(position ? { 'info.heroPos': position } : {}),
                ...(mistakes ? { 'analysis.mistakes': { $exists: true, $ne: [] } } : {})
              },
            },
            // Add unwind for mistakes when needed
            ...(mistakes ? [ {
              $unwind: {
                path: '$analysis.mistakes',
                preserveNullAndEmptyArrays: true
              }
            } ] : []),
            {
              $group: {
                _id: {
                  card1: '$preflopSummary.cards.card1',
                  card2: '$preflopSummary.cards.card2',
                },
                count: { $sum: 1 },
                handIds: { $addToSet: '$_id' },
                // Track mistake counts and severities
                ...(mistakes ? {
                  mistakeCount: {
                    $sum: { $cond: [ { $isArray: '$analysis.mistakes' }, 1, 0 ] }
                  },
                  avgSeverity: { $avg: '$analysis.mistakes.severity' }
                } : {})
              },
            },
            {
              $sort: { count: -1 },
            }
          ],
          totalCount: [
            {
              $match: {
                ownerId,
                'info.isVPIP': true,
                ...(position ? { 'info.heroPos': position } : {}),
                ...(mistakes ? { 'analysis.mistakes': { $exists: true, $ne: [] } } : {})
              },
            },
            {
              $count: 'total'
            }
          ]
        }
      }
    ];

    const result = await this.aggregate(pipeline);
    const totalHands = result[0].totalCount[0]?.total || 0;

    // Transform results to group by hand type (suited/offsuit/pairs)
    const groupedHands = result[0].hands.reduce((acc, hand) => {
      // eslint-disable-next-line no-underscore-dangle
      const { card1, card2 } = hand._id;
      if (!card1 || !card2) return acc;
      const rank1 = card1[0];
      const rank2 = card2[0];
      const suit1 = card1[1];
      const suit2 = card2[1];

      const rankOrder = '23456789TJQKA';
      const rank1Order = rankOrder.indexOf(rank1);
      const rank2Order = rankOrder.indexOf(rank2);

      let handKey;
      if (rank1 === rank2) {
        // Pair
        handKey = rank1 + rank1;
      } else {
        // Sort ranks so higher rank is always first
        const [ highRank, lowRank ] = rank1Order > rank2Order
          ? [ rank1, rank2 ]
          : [ rank2, rank1 ];

        if (suit1 === suit2) {
          // Suited
          handKey = `${highRank}${lowRank}s`;
        } else {
          // Offsuit
          handKey = `${highRank}${lowRank}o`;
        }
      }

      if (!acc[handKey]) {
        acc[handKey] = {
          count: 0,
          mistakeCount: 0,
          avgSeverity: 0,
        };
      }
      acc[handKey].count += hand.count;
      if (mistakes) {
        acc[handKey].mistakeCount += hand.mistakeCount || 0;
        acc[handKey].avgSeverity = (acc[handKey].avgSeverity + (hand.avgSeverity || 0)) / 2;
      }

      return acc;
    }, {});

    return Object.entries(groupedHands).map(([ key, value ]) => {
      const weight = totalHands > 0 ? (value.count / totalHands) * 100 : 0;

      // Color coding based on mistake frequency when mistakes=true
      let color = '#7DC579'; // Default green
      if (mistakes && value.count > 0) {
        const mistakeRate = value.mistakeCount / value.count;
        if (mistakeRate >= 0.7) {
          color = '#FF4D4D'; // Red for high mistake rate
        } else if (mistakeRate >= 0.4) {
          color = '#FFA500'; // Orange for medium mistake rate
        } else if (mistakeRate >= 0.2) {
          color = '#FFD700'; // Yellow for low mistake rate
        }
      }

      return {
        combo: key,
        count: value.count,
        weight,
        color,
        ...(mistakes ? {
          mistakeCount: value.mistakeCount,
          mistakeRate: value.count > 0 ? (value.mistakeCount / value.count) : 0,
          avgSeverity: Math.round(value.avgSeverity * 100) / 100
        } : {})
      };
    });
  }
}

module.exports = new Hands();
