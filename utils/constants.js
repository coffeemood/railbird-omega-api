const handOrder = [ 'AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', '88', 'AQs', 'AKo', 'AJs', 'ATs', 'KQs', 'AQo', '77', 'KJs', 'AJo', 'KTs', 'A9s', 'KQo', 'ATo', 'QJs', 'A8s', '66', 'KJo', 'QTs', 'A7s', 'K9s', 'KTo', 'JTs', 'A9o', 'A5s', 'QJo', 'A6s', 'Q9s', 'A4s', 'A8o', '55', 'QTo', 'K8s', 'A3s', 'J9s', 'A7o', 'K7s', 'K9o', 'JTo', 'A2s', 'T9s', 'Q8s', 'K6s', 'A5o', 'A6o', 'Q9o', 'K5s', 'J8s', 'A4o', 'K8o', '44', 'T8s', 'K4s', 'Q7s', 'A3o', 'J9o', 'K7o', '98s', 'K3s', 'Q6s', 'T9o', 'A2o', 'J7s', 'Q8o', 'K6o', 'K2s', 'Q5s', 'T7s', 'J8o', 'Q4s', 'K5o', '97s', '33', '87s', 'T8o', 'J6s', 'Q3s', 'Q7o', 'K4o', 'J5s', '98o', 'T6s', 'Q2s', 'Q6o', 'K3o', '96s', 'J7o', 'J4s', '86s', '76s', 'Q5o', 'K2o', 'T7o', 'J3s', '22', 'T5s', '97o', 'Q4o', 'J2s', '87o', '95s', 'T4s', '65s', '75s', '85s', 'J6o', 'Q3o', 'T3s', 'J5o', 'T6o', '54s', 'Q2o', 'T2s', '96o', '64s', '86o', '76o', '94s', 'J4o', '74s', '84s', '93s', 'J3o', '53s', 'T5o', '92s', '65o', '63s', 'J2o', '95o', 'T4o', '75o', '85o', '73s', '43s', '83s', '82s', 'T3o', '52s', '54o', 'T2o', '62s', '64o', '42s', '94o', '72s', '74o', '84o', '93o', '32s', '53o', '92o', '63o', '43o', '73o', '83o', '82o', '52o', '62o', '42o', '72o', '32o' ];

const cardRankings = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};

const cardValue = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: 'T',
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};

const cardRankingsLow = {
  A: 1,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};

const cardPrimes = {
  2: 2,
  3: 3,
  4: 5,
  5: 7,
  6: 11,
  7: 13,
  8: 17,
  9: 19,
  T: 23,
  J: 29,
  Q: 31,
  K: 37,
  A: 41
};

const openEnderCombos = [
  '2345', '3456', '4567', '5678', '6789', '789T', '89TJ', '9TJQ', 'TJQK'
];

const gutshotCombos = [
  'A235', 'A234', 'A345', 'A245',
  '2356', '2456', '2346',
  '3457', '3567', '3467',
  '4578', '4678', '4568',
  '5689', '5789', '5679',
  '679T', '689T', '678T',
  '789J', '79TJ', '78TJ',
  '89TQ', '8TJQ', '89JQ',
  '9TQK', '9JQK', '9TJK',
  'TJQA', 'TJKA', 'JQKA', 'AKQT',
];

const openEnderLookup = openEnderCombos.map((combo) => Array.from(combo).reduce((a, c) => a * cardPrimes[c], 1));
const gutShotLookup = gutshotCombos.map((combo) => Array.from(combo).reduce((a, c) => a * cardPrimes[c], 1));

const cards = [ 'A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2' ];

const matrix = cards.map((c1, c1Index) => {
  const xRow = cards.map((c2, c2Index) => {
    const type = c1 === c2 ? 'pair' : 'suited';
    const value = c1Index < c2Index ? `${c1}${c2}` : `${c2}${c1}`;
    return {
      type,
      value: type === 'pair' ? value : `${value}s`,
      xIndex: c1Index,
      yIndex: c2Index,
    };
  });
  const yRow = cards.map((c3, c3Index) => {
    const type = c1 === c3 ? 'pair' : 'offsuit';
    const value = c1Index < c3Index ? `${c1}${c3}` : `${c3}${c1}`;
    return {
      type,
      value: type === 'pair' ? value : `${value}o`,
      xIndex: c3Index,
      yIndex: c1Index,
    };
  });
  return xRow.concat(yRow);
})
  .flat();

const matrixTable = Array.from(new Set(matrix.map((a) => a.value)))
  .map((value) => matrix.find((a) => a.value === value));

  // Position mappings
const POSITION_MAP = {
  'empty': 0,
  'utg': 1,
  'utg+1': 2,
  'utg+2': 3,
  'utg+3': 4,
  'mp': 5,
  'mp+1': 6,
  'mp+2': 7,
  'lj': 8,
  'hj': 9,
  'co': 10,
  'bu': 11,
  'btn': 11,  // Alias
  'sb': 12,
  'bb': 13
};

// Position bucket mappings
const POSITION_BUCKETS = {
  'EARLY': ['utg', 'utg+1', 'utg+2', 'utg+3'],
  'MP': ['mp', 'mp+1', 'mp+2', 'lj'],
  'LP': ['hj', 'co', 'bu', 'btn'],
  'BLINDS': ['sb', 'bb']
};

// Reverse mapping for quick lookup
const POSITION_TO_BUCKET = {};
Object.entries(POSITION_BUCKETS).forEach(([bucket, positions]) => {
  positions.forEach(pos => {
    POSITION_TO_BUCKET[pos] = bucket;
  });
});

// Street mappings
const STREET_MAP = {
  'turn': 0,
  'river': 1,
  'flop': 2
};

// Game type mappings
const GAME_TYPE_MAP = {
  'cash': 0,
  'mtt': 1
};

// Pot type mappings
const POT_TYPE_MAP = {
  'srp': 0,
  '3bp': 1,
  '4bp': 2
};

// Action type encoding
const ACTION_ENCODING = {
  'check': 0,
  'x': 0,
  'call': 1,
  'c': 1,
  'bet': 2,
  'b': 2,
  'raise': 3,
  'r': 3,
  'all-in': 4,
  'allin': 4,
  'a': 4,
  'fold': 5,
  'f': 5
};

// Action symbols for sequence generation
const ACTION_SYMBOLS = {
  0: 'X',  // Check
  1: 'C',  // Call
  2: 'B',  // Bet
  3: 'R',  // Raise
  4: 'A',  // All-in
  5: 'F'   // Fold
};

// Bet size buckets (as % of pot)
const BET_SIZE_BUCKETS = {
  SMALL: 0,     // <33%
  MEDIUM: 1,    // 33-66%
  LARGE: 2,     // 66-100%
  OVERBET: 3,   // >100%
  ALLIN: 4      // All-in
};

// Board texture constants
const BOARD_TEXTURE = {
  // Flop archetypes
  HHH: 25,
  HHM: 50,
  HHL: 75,
  HMM: 100,
  HML: 125,
  HLL: 150,
  MMM: 175,
  MML: 200,
  MLL: 225,
  LLL: 240
};

// Card rank values
const RANK_VALUES = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4,
  '7': 5, '8': 6, '9': 7, 'T': 8, 'J': 9,
  'Q': 10, 'K': 11, 'A': 12
};

// Feature vector dimensions
const VECTOR_DIMENSIONS = {
  TOTAL: 71,  // Simplified to remove action encoding, add check frequency
  STREET: 0,
  GAME_TYPE: 1,
  POT_TYPE: 2,
  OOP_POS_START: 3,
  OOP_POS_END: 16,
  IP_POS_START: 17,
  IP_POS_END: 30,
  BOARD_TEX_START: 31,
  BOARD_TEX_END: 38,
  POSITION_FLAG: 39,
  STACK_BB: 40,
  STACK_BB_SOLVE: 41,
  POT_BB: 42,
  TAGS_START: 43,
  TAGS_END: 58,
  // Action frequencies (dims 59-64)
  CHECK_FREQ: 59,
  SIZE_BUCKETS_START: 60,
  SIZE_BUCKETS_END: 64,
  // Turn-specific features (dims 65-70)
  TURN_RANK_BUCKET: 65,
  TURN_PAIR_FLAG: 66,
  FLUSH_COMPLETION: 67,
  NEW_FD_FLAG: 68,
  STRAIGHT_COMPLETION: 69,
  RANK_NORM: 70
};


module.exports = {
  cardRankings,
  cardRankingsLow,
  cardPrimes,
  openEnderLookup,
  gutShotLookup,
  matrixTable,
  cardValue,
  handOrder,
  POSITION_MAP,
  POSITION_BUCKETS,
  POSITION_TO_BUCKET,
  STREET_MAP,
  GAME_TYPE_MAP,
  POT_TYPE_MAP,
  ACTION_ENCODING,
  ACTION_SYMBOLS,
  BET_SIZE_BUCKETS,
  BOARD_TEXTURE,
  RANK_VALUES,
  VECTOR_DIMENSIONS
};
