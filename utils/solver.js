const { Hand } = require('pokersolver');
const {
  cardPrimes,
  openEnderLookup,
  gutShotLookup,
  cardValue,
  cardRankings,
} = require('./constants');

const combinations = (array, length) => new Array(1 << array.length).fill()
  .map((e1, i) => array.filter((e2, j) => i & 1 << j))
  .filter((e) => (length ? e.length === length : true));

const average = (arr) => arr.reduce((p, c) => p + c, 0) / arr.length;

const getSuit = (val) => {
  if (val === 's') return '<span class="spades"></span>';
  if (val === 'h') return '<span class="hearts"></span>';
  if (val === 'c') return '<span class="clubs"></span>';
  if (val === 'd') return '<span class="diamonds"></span>';
  return '';
};

const getFlopType = (flop) => {
  let mt = false;
  let fd = false;
  [ 's', 'c', 'd', 'h' ].forEach((suit) => {
    const occurence = (flop.match(new RegExp(suit, 'g')) || []).length;
    if (occurence > 2) mt = true;
    if (occurence > 1) fd = true;
  });
  if (mt) return 'Monotone';
  if (fd) return 'Flushdraw';
  return 'Rainbow';
};

const getIsPaired = (flop) => {
  const [ first, second, third, fourth, fifth, sixth ] = flop;
  if (first === third || third === fifth || first === fifth) return 'Paired';
  return 'Unpaired';
};

const getFlopArchetype = (flop) => {
  const [ first, second, third, fourth, fifth, sixth ] = flop;
  const archetype = (s) => {
    if (Number.isNaN(+s)) return 'High';
    return +s <= 5 ? 'Low' : 'Medium';
  };
  return `${archetype(first)}${archetype(third)}${archetype(fifth)}`;
};

const debounce = (func, wait) => {
  let timeout;

  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const groupBy = (list, keyGetter) => {
  const map = new Map();
  list.forEach((item) => {
    const key = keyGetter(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [ item ]);
    } else {
      collection.push(item);
    }
  });
  return map;
};

const toPrimes = (arr) => arr.map((combo) => Array.from(combo).reduce((a, c) => a * cardPrimes[c], 1));

const backdoorSDLookup = [ 246, 410, 615, 574, 861, 1435, 30, 42, 70, 105, 66, 110, 165, 154, 231, 385, 195, 273, 455, 429, 715, 1001, 595, 935, 1309, 1105, 1547, 2431, 1463, 1729, 2717, 2261, 3553, 4199, 246, 410, 615, 574, 861, 1435, 10013, 21793, 47027, 6409, 7163, 9367, 20387, 43993, 15283, 17081, 36859, 33263, 3289, 4301, 5083, 4807, 5681, 7429, 16169, 34891, 12121, 13547, 29233, 26381, 8671, 11339, 12673, 27347, 24679, 20677 ];

const evaluateDraw = (hand, flop) => {
  const [ firstCard, firstSuit, secondCard, secondSuit ] = hand;
  const [ [ firstFlop, ffSuit ], [ secondFlop, sfSuit ], [ thirdFlop, tfSuit ] ] = flop;
  const allSuits = [ firstSuit, secondSuit, ffSuit, sfSuit, tfSuit ];
  const allRanks = [ firstCard, secondCard, firstFlop, secondFlop, thirdFlop ];
  const allCombinations = toPrimes(combinations(allRanks, 4)); // Get all 4 card combinations, convert to prime
  const allThreeCardCombinations = toPrimes(combinations(allRanks, 3)).filter((prime) => !toPrimes([ [ firstFlop, secondFlop, thirdFlop ] ]).includes(prime)); // Need to filter out the prime of 3 card from the flop
  const isFlushDraw = allSuits.some((suit) => allSuits.filter((s) => s === suit).length === 4);
  const isBDFD = !isFlushDraw && firstSuit === secondSuit && [ ffSuit, sfSuit, tfSuit ].includes(firstSuit);

  const isOpenEnder = allCombinations.some((combo) => openEnderLookup.includes(combo));
  const isGutShot = allCombinations.some((combo) => gutShotLookup.includes(combo));
  const isDoubleGutter = allCombinations.filter((combo) => gutShotLookup.includes(combo)).length > 1;
  const isBackDoorSD = !isOpenEnder && !isGutShot && allThreeCardCombinations.filter((combo) => backdoorSDLookup.includes(combo)).length > 0;

  if (isFlushDraw) {
    if (isOpenEnder) return 'Combo Draw';
    if (isGutShot) return 'Flushdraw + Gut Shot';
    return 'Flushdraw';
  }

  if (isBDFD) {
    if (isOpenEnder) return 'BDFD + Open Ender';
    if (isGutShot) return 'BDFD + GS';
    if (isBackDoorSD) return 'Double Backdoor';
    return 'BDFD';
  }

  if (isOpenEnder) return 'Open Ender';
  if (isDoubleGutter) return 'Double Gutter';
  if (isGutShot) return 'Gut Shot';
  if (isBackDoorSD) return 'Backdoor Straight Draw';
  return 'No Draw';
};

const selectColor = (number) => {
  const hue = (number) * 137.508; // use golden angle approximation
  return `hsl(${hue},95%,65%)`;
};

const parseRange = (string) => {
  const re = /\[([\s\S]+?)\]*\[\/([\s\S]+?)\],/g;
  const reWithoutComma = /\[([\s\S]+?)\]*\[\/([\s\S]+?)\]/g;
  const withComma = string.match(re) || [];

  let firstIteration = string;
  if (withComma.length) {
    withComma.forEach((substring) => {
      firstIteration = firstIteration.replace(substring.replace(/\"/, '',), '');
    });
  }

  const withoutComma = firstIteration.match(reWithoutComma) || [];

  let pure = firstIteration;
  if (withoutComma.length) {
    withoutComma.forEach((substring) => {
      pure = pure.replace(substring.replace(/\"/, '',), '');
    });
  }

  const weighted = withComma.concat(withoutComma);

  const formattedWeightRange = weighted.map((range) => {
    const regex = /\[([1-9].*?)\]/g;
    const weight = range.match(regex);
    const weightValue = weight[0].replace('[', '').replace(']', '');
    const formattedRange = range.replace(`[${weightValue}]`, '').replace(`[/${weightValue}]`, '');
    const split = formattedRange.split(',');
    return split.map((s) => ({
      range: s,
      weight: +weightValue / 100
    }));
  }).flat();

  const finalRange = pure.split(',').map((range) => ({ range, weight: 1 })).concat(formattedWeightRange);

  return finalRange.map((section) => {
    let combos;
    const { range } = section;
    if (!range.includes('-')) combos = [ range ];
    else {
      const getRange = (min, max) => [ ...Array(max - min + 1).keys() ].map((i) => i + min);
      const [ start, finish ] = range.split('-');
      const isPair = start[0] === start[1];
      const rangeOfCards = getRange(cardRankings[finish[1]], cardRankings[start[1]]);
      if (isPair) {
        combos = rangeOfCards.map((c) => `${cardValue[c]}${cardValue[c]}`);
      } else {
        combos = rangeOfCards.map((c) => `${start[0]}${cardValue[c]}${start[2]}`);
      }
    }
    return combos.map((c) => ({
      weight: section.weight,
      combo: c
    }));
  }).flat().filter((c) => c.combo !== '');
};

const getBestHand = (fullHand) => {
  const hand = Hand.solve(fullHand);
  return hand.name;
};

module.exports = {
  average,
  getFlopType,
  getIsPaired,
  getFlopArchetype,
  getSuit,
  debounce,
  groupBy,
  evaluateDraw,
  selectColor,
  parseRange,
  getBestHand,
};
