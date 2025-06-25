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

module.exports = {
  cardRankings,
  cardRankingsLow,
  cardPrimes,
  openEnderLookup,
  gutShotLookup,
  matrixTable,
  cardValue,
  handOrder,
};
