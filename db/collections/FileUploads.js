const Collection = require('../collection');
const { ID } = require('./common/datatype');
const SuperCollection = require('./common/supercollection');
const s3 = require('../../utils/s3');
const Hands = require('./Hands');

// File Uploads collection
const fileUploadsCollection = new Collection('file-uploads', { autoIncrementId: 'file-uploads', autoIncrementPrefix: 10 });

/**
 * File Uploads Schema -
 */
const fileUploadSchema = {
  ownerId: String,
  // fileName will be auto-increment and is used as unique name in S3, also used to reference session
  fileName: String,
  title: String,
  description: String,
  tags: Array, // array of strings
  privacy: String, // private, social, public -- This is used for sharable links
  playedOn: Number,
  noHands: Number,
  room: Array,
  gameType: String,
  createdAt: Number,
  sessionStart: Number,
  sessionEnd: Number,
  heroWinLoss: String,
  status: String, // uploading, failed, processing, processed
  meta: Object,
};

/**
 * File Uploads Relation Maps
 */
const fileUploadsRelationMaps = [
];

/**
 * FileUploads Public Fields
 * Fields that can be passed to public endpoints
 * Use with findByIdWithPublicFields, findByQueryWithPublicFields
 */
const fileUploadssPublicFields = {
};

class FileUploads extends SuperCollection {
  constructor() {
    super(fileUploadsCollection, fileUploadSchema, fileUploadsRelationMaps, fileUploadssPublicFields);
  }

  async getSessionStatistics(id) {
    const session = await this.findById(id);
    if (!session) {
      throw new Error('Session not found');
    }
    // Stats required: Net Won, Total Hands, BB/100, VPIP, PFR, 3Bet, WWSF, All-in EV
    // Net won = Total of all hands where playerChips array element with hero = true & winLosBB > 0
    // Total Hands = Total of all hands with sourceFile = id
    // BB/100 = Net won / Total Hands * 100
    // VPIP = Total of all hands where hand.info.isVPIP = true
    // PFR = Total of all hands where hand.info.isPFR = true
    // 3Bet = Total of all hands where hand.info.isHero3B = true
    // WWSF = Total of all hands where hand.info.sawFlop = true & playerChips array element with hero = true & winLosBB > 0

    const hands = await Hands.aggregate([
      { $match: { sourceFile: id } },
      {
        $project: {
          _id: 0,
          info: 1,
          playerChips: 1,
          actionScript: 1,
        }
      }
    ]);
    if (hands.every(hand => !hand.playerChips.find(pc => pc.hero))) {
      return {
        netWon: 0,
        totalHands: 0,
        bb100: 0,
        vpip: 0,
        pfr: 0,
        threeBet: 0,
        wwsf: 0,
        allInEV: 0,
      };
    }
    const netWon = (hands.reduce((acc, hand) => {
      const heroChip = hand.playerChips.find(pc => pc.hero);
      return acc + (heroChip?.winLossBB || 0);
    }, 0)).toFixed(2);
    const totalHands = hands.length;
    // eslint-disable-next-line no-mixed-operators
    const bb100 = totalHands ? (netWon / totalHands * 100).toFixed(2) : 0;
    // eslint-disable-next-line no-mixed-operators
    const vpip = (hands.filter(hand => hand.info.isVPIP).length / totalHands * 100).toFixed(2);
    // eslint-disable-next-line no-mixed-operators
    const pfr = (hands.filter(hand => hand.info.isPFR).length / totalHands * 100).toFixed(2);
    // eslint-disable-next-line no-mixed-operators
    const threeBet = (hands.filter(hand => hand.info.isHero3B).length / totalHands * 100).toFixed(2);
    const sawFlop = hands.filter(hand => hand.info.sawFlop).length;
    const wwsf = sawFlop
    // eslint-disable-next-line no-mixed-operators
      ? (hands.filter(hand => hand.info.sawFlop && hand.playerChips.find(pc => pc.hero).winLossBB > 0).length / sawFlop * 100)
        .toFixed(2)
      : 0;
    const allInEV = 0;
    return {
      netWon,
      totalHands,
      bb100,
      vpip,
      pfr,
      threeBet,
      wwsf,
      allInEV,
    };
    // return hand;
  }
}

module.exports = new FileUploads();
