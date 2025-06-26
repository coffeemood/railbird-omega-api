const joi = require('joi');

const card = /[A,K,Q,J,T,9,8,7,6,5,4,3,2][s,h,d,c]/i;
const positions = [ 'utg', 'utg+1', 'utg+2', 'utg+3', 'mp', 'mp+1', 'mp+2', 'lj', 'hj', 'co', 'bu', 'btn', 'sb', 'bb', '' ];
const actions = [ 'raise', 'call', 'check', 'fold', 'R', 'C', 'X', 'F', 'bet', 'B', 'collect', 'bet-returned' ];
const gameTypes = [ 'holdem', 'omaha' ];
const limits = [ 'nolimit', 'potlimit' ];
const potTypes = [ 'srp', '3bp', '4bp', '5bp+', 'aipf', 'limped', 'walk' ];
const streets = [ 'posts', 'preflop', 'flop', 'turn', 'river', 'showdown' ];

const accesses = [ 'read', 'write' ];
const postTypes = [ 'hand', 'note', 'quick-hand', 'session' ];
const voteTypes = [ 'post', 'comment' ];
const commentTypes = [ 'post', 'comment', 'hand' ];
const privacies = [ 'public', 'social', 'private' ];

class Types {
  static ID = joi.number().min(1).required().strict();

  static TimeStamp = joi.date().timestamp();

  static IntZero = joi.number().strict();

  static IntZeroInfinity = joi.number().allow(Infinity).strict();

  static IntPositive = joi.number().min(0.01).strict();

  static IntMinMax(min = 0, max = Infinity) { return joi.number().min(min).max(max).strict(); }

  static String = joi.string();

  static StringEmpty = joi.string().allow('');

  static StringLength = (length = 0) => joi.string().length(length);

  static GameType = joi.string().valid(...gameTypes);

  static Position = joi.string().min(2).valid(...positions).insensitive();

  static Action = joi.string().valid(...actions).insensitive();

  static Limit = joi.string().valid(...limits);

  static Boolean = joi.boolean();

  static Card = joi.string().max(2).pattern(card);

  static Cards = joi.array().has(this.Card);

  static PotType = joi.string().valid(...potTypes);

  static Street = joi.string().valid(...streets);

  static Access = joi.string().valid(...accesses);

  static PostType = joi.string().valid(...postTypes).required();

  static CommentType = joi.string().valid(...commentTypes).required();

  static VoteType = joi.string().valid(...voteTypes).required();

  static Privacy = joi.string().valid(...privacies);

  static Content = joi.object().required().min(1);

  static StreetSummary = joi.object({
    pot: this.IntPositive,
    potBB: this.IntPositive,
    board: this.Card,
    playersInvolved: this.IntPositive,
    heroFlopSummary: this.StringEmpty,
    heroTurnSummary: this.StringEmpty,
    heroRiverSummary: this.StringEmpty,
  });

  static StreetActions = joi.array().items(
    joi.object({
      pos: this.Position,
      type: this.Action,
      number: this.IntZero,
      amountBB: this.IntPositive,
      amount: this.IntPositive,
    })
  );
}

module.exports = Types;
