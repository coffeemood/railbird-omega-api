const joi = require('joi');
const Types = require('./types');

const handSchema = joi
  .array()
  .items(
    joi.object({
      // GENERIC INFO
      indexInCollection: joi.number().required(),
      header: joi.object({
        gameno: Types.String,
        room: Types.String, // 'pokerstars',
        gametype: Types.String, // 'cashgame', 'tournament'
        currency: Types.String, // '$',
        donation: Types.IntZero, // 10,
        rake: Types.IntZero, // 1,
        pokertype: Types.GameType, // 'holdem', 'omaha'
        limit: Types.Limit, // 'nolimit',
        sb: Types.IntPositive, // 0.01,
        bb: Types.IntPositive, // 0.02,
        ante: Types.IntZero, // 0,
        maxseats: Types.IntMinMax(2), // 6
        handid: Types.String, // '109440597427536182431',
        year: Types.IntMinMax(2000, 2100), // 2014,
        month: Types.IntMinMax(1, 12), // 3,
        day: Types.IntMinMax(1, 31), // 9,
        hour: Types.IntMinMax(0, 23), // 15,
        min: Types.IntMinMax(0, 59), // 57,
        sec: Types.IntMinMax(0, 59), // 57,
        timezone: Types.String, // 'ET',
        // Moment timestamp
        timestamp: Types.IntPositive,
        players: Types.IntMinMax(2, 10), // 6,
        anyInvested: Types.Boolean, // true,
        anySawFlop: Types.Boolean, // true,
        pots: joi.object({
          preflop: Types.IntZero, // 0.06,
          flop: Types.IntZero, // 0.06,
          turn: Types.IntZero, // 0.06,
          river: Types.IntZero, // 0.06,
          showdown: Types.IntZero, // 0.24,
        }),
      }).required(true).unknown(),

      // NOTES
      notes: joi.array(),

      // HAND INFO
      info: joi.object({
        potType: Types.PotType,
        effStack: Types.IntZero, // Effective Stack from Hero's perspective
        isVPIP: Types.Boolean,
        isPFR: Types.Boolean,
        isHeroAllIn: Types.Boolean,
        isHero2B: Types.Boolean,
        isHero3B: Types.Boolean,
        isHero4B: Types.Boolean,
        isHero5B: Types.Boolean,
        isRainbow: Types.Boolean,
        isTwoTones: Types.Boolean,
        isMonoTone: Types.Boolean,
        isBroadway: Types.Boolean,
        isPaired: Types.Boolean,
        isThreeOfAKind: Types.Boolean,
        highestCard: Types.StringEmpty,
        heroPos: Types.Position,
        sawFlop: Types.Boolean,
        sawTurn: Types.Boolean,
        sawRiver: Types.Boolean,
        sawShowdown: Types.Boolean,
        heroSeatIndex: Types.IntZero,
        heroWinning: Types.IntZero,
        heroWinningBB: Types.IntZero,
      }).required(true),

      // Players' Chips summary before and after hand
      playerChips: joi.array().items(
        joi.object({
          pos: Types.Position,
          name: Types.String,
          chips: Types.IntPositive,
          chipsAfter: Types.IntZero,
          bb: Types.IntPositive,
          bbAfter: Types.IntZero,
          winLoss: Types.IntZero,
          winLossBB: Types.IntZero,
          hero: Types.Boolean,
          bounty: Types.StringEmpty,
          vpip: Types.IntZeroInfinity,
          pfr: Types.IntZeroInfinity,
          threeBet: Types.IntZeroInfinity,
        })
      ),

      players: joi.array().items(
        joi.object({
          pos: Types.Position,
          name: Types.String,
          cards: joi.object({
            card1: Types.Card,
            card2: Types.Card,
          }),
          preflopOrder: Types.IntZero,
          postflopOrder: Types.IntZero,
        })
      ),

      // SEATS
      seats: joi.array().items(
        joi.object({
          pos: Types.Position,
          chipsBB: Types.IntPositive,
          chipsAmount: Types.IntPositive,
          hero: Types.Boolean,
          m: Types.IntZero,
        })
      ),

      board: joi.object({
        card1: Types.Card,
        card2: Types.Card,
        card3: Types.Card,
        card4: Types.Card,
        card5: Types.Card,
      }),

      // POSTS

      posts: joi.array().items(joi.object({
        name: Types.String,
        amount: Types.IntZero,
        type: Types.String,
        playerIndex: Types.IntZero,
        chips: Types.IntZero,
        chipsAfter: Types.IntZero,
      }).required()),

      // Preflop
      preflopSummary: joi.object({
        cards: joi.object({
          card1: Types.Card,
          card2: Types.Card,
        }),
        pos: Types.Position,
        heroPreflopSummary: Types.StringEmpty,
      }),

      // Flop
      flopSummary: joi.object({
        pot: Types.IntPositive,
        potBB: Types.IntPositive,
        board: Types.Cards,
        playersInvolved: Types.IntPositive,
        heroFlopSummary: Types.StringEmpty,
      }),

      // Turn
      turnSummary: Types.StreetSummary,

      // River
      riverSummary: Types.StreetSummary,

      // Summary & Spoilers
      totalPot: joi.object({
        amount: Types.IntPositive,
        bb: Types.IntPositive
      }),
      spoilers: joi.array().items(
        joi.object({
          pos: Types.Position,
          cards: joi.object({
            card1: Types.Card,
            card2: Types.Card
          })
        })
      ),

      // Street-by-Street script
      actionScript: joi.array().items(
        joi.object({
          action: joi.object({
            type: Types.Action,
            ratio: Types.IntZeroInfinity,
            allin: Types.Boolean,
            amount: Types.IntZero,
            pot: Types.IntZero,
            potAfter: Types.IntZero,
            chips: Types.IntZero,
            chipsAfter: Types.IntZero,
            bet: Types.IntZero,
            chipsInFront: Types.IntZero,
            winall: Types.Boolean,
          }),
          isNewStreet: Types.Boolean,
          playerIndex: Types.IntZero,
          street: Types.Street
        })
      ),
      // allow any object for raw
      raw: joi.object()
    })
  )
  .min(1)
  .required();

module.exports = handSchema;
