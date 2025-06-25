/**
 * Utility functions for working with poker cards and hand categories
 * Based on the original utils.js
 */

// Card utilities
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

// Hand categories
const HAND_CATEGORIES = {
  FLUSH: 'flush',
  FLUSH_DRAW: 'flushDraw',
  STRAIGHT: 'straight',
  STRAIGHT_DRAW: 'oesd',  // Renamed to OESD for UI consistency
  GUTSHOT: 'gutshot',
  FULL_HOUSE: 'fullHouse',
  QUADS: 'quads',
  STRAIGHT_FLUSH: 'straightFlush',
  SET: 'set',
  TRIPS: 'trips',  // Added trips as a separate category
  TWO_PAIR: 'twoPair',
  TOP_PAIR: 'topPair',
  MIDDLE_PAIR: 'middlePair',
  WEAK_PAIR: 'weakPair',
  OVER_PAIR: 'overPair',
  ACE_HIGH: 'aceHigh',  // Added ace high
  UNDER_PAIR: 'underPair',
  NO_MADE_HAND: 'air',
};

// Add human-friendly names for each category
const HAND_CATEGORY_NAMES = {
  'flush': 'flush',
  'flushDraw': 'flush draw',
  'straight': 'straight',
  'oesd': 'OESD',
  'gutshot': 'gutshot',
  'fullHouse': 'boat',
  'quads': 'quads',
  'straightFlush': 'straight flush',
  'set': 'set',
  'trips': 'trips',
  'twoPair': 'two pair',
  'topPair': 'top pair',
  'middlePair': 'middle pair',
  'weakPair': 'weak pair',
  'overPair': 'overpair',
  'aceHigh': 'ace high',
  'underPair': 'under pair',
  'air': 'Air',
};

// Board texture constants
const BOARD_TEXTURES = {
  MONOTONE: 'monotone',
  TWO_TONE: 'two-tone',
  RAINBOW: 'rainbow'
};

const BOARD_ARCHETYPES = {
  HIGH_HIGH_HIGH: 'high-high-high',
  HIGH_HIGH_MID: 'high-high-mid',
  HIGH_HIGH_LOW: 'high-high-low',
  HIGH_MID_MID: 'high-mid-mid',
  HIGH_MID_LOW: 'high-mid-low',
  HIGH_LOW_LOW: 'high-low-low',
  MID_MID_MID: 'mid-mid-mid',
  MID_MID_LOW: 'mid-mid-low',
  MID_LOW_LOW: 'mid-low-low',
  LOW_LOW_LOW: 'low-low-low'
};

/**
 * Gets the numeric value of a card rank
 * @param {string} rank - Card rank (2-9, T, J, Q, K, A)
 * @returns {number} Numeric value of the rank
 */
function getRankValue(rank) {
  const values = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank];
}

/**
 * Gets sorted rank values from an array of cards
 * @param {Array} cards - Array of card objects with rank property
 * @returns {Array} Sorted array of unique rank values
 */
function getRankValues(cards) {
  // Extract rank values, sort them, and remove duplicates
  return [...new Set(cards
    .map(card => getRankValue(card.rank)))]
    .sort((a, b) => a - b); // Sort and remove duplicates
}

/**
 * Converts a specific combo to a logical hand representation (e.g., AKs, 22)
 * @param {string} combo - Combo string (e.g., "AhKh")
 * @returns {string} Logical hand representation
 */
function getLogicalHandRepresentation(combo) {
  const card1 = { rank: combo[0], suit: combo[1] };
  const card2 = { rank: combo[2], suit: combo[3] };
  
  // For pairs
  if (card1.rank === card2.rank) {
    return card1.rank + card2.rank;
  }
  
  // For non-pairs, put higher card first
  const rank1Value = getRankValue(card1.rank);
  const rank2Value = getRankValue(card2.rank);
  
  let firstRank, secondRank;
  let suited = '';
  
  if (rank1Value >= rank2Value) {
    firstRank = card1.rank;
    secondRank = card2.rank;
  } else {
    firstRank = card2.rank;
    secondRank = card1.rank;
  }
  
  // Check if suited
  if (card1.suit === card2.suit) {
    suited = 's';
  } else {
    suited = 'o';
  }
  
  return firstRank + secondRank + suited;
}

/**
 * Categorizes a hand based on the board
 * @param {string} combo - Card combo (e.g., "AhKh")
 * @param {Array} board - Array of board cards
 * @returns {string} Hand category
 */
function categorizeHand(combo, board) {
  // Extract the two cards from the combo
  const card1 = { rank: combo[0], suit: combo[1] };
  const card2 = { rank: combo[2], suit: combo[3] };
  
  // Parse the board cards
  const boardCards = board.map(card => ({ rank: card[0], suit: card[1] }));
  
  // Check for made hands first (strongest to weakest)
  if (hasStraightFlush(card1, card2, boardCards)) {
    return HAND_CATEGORIES.STRAIGHT_FLUSH;
  }
  
  if (hasQuads(card1, card2, boardCards)) {
    return HAND_CATEGORIES.QUADS;
  }
  
  if (hasFullHouse(card1, card2, boardCards)) {
    return HAND_CATEGORIES.FULL_HOUSE;
  }
  
  if (hasFlush(card1, card2, boardCards)) {
    return HAND_CATEGORIES.FLUSH;
  }
  
  if (hasStraight(card1, card2, boardCards)) {
    return HAND_CATEGORIES.STRAIGHT;
  }
  
  if (hasSet(card1, card2, boardCards)) {
    return HAND_CATEGORIES.SET;
  }
  
  if (hasTrips(card1, card2, boardCards)) {
    return HAND_CATEGORIES.TRIPS;
  }
  
  if (hasTwoPair(card1, card2, boardCards)) {
    return HAND_CATEGORIES.TWO_PAIR;
  }
  
  // Check for different pairs
  if (hasOverPair(card1, card2, boardCards)) {
    return HAND_CATEGORIES.OVER_PAIR;
  }
  
  if (hasTopPair(card1, card2, boardCards)) {
    return HAND_CATEGORIES.TOP_PAIR;
  }
  
  if (hasMiddlePair(card1, card2, boardCards)) {
    return HAND_CATEGORIES.MIDDLE_PAIR;
  }
  
  if (hasWeakPair(card1, card2, boardCards)) {
    return HAND_CATEGORIES.WEAK_PAIR;
  }

  if (hasUnderPair(card1, card2, boardCards)) {
    return HAND_CATEGORIES.UNDER_PAIR;
  }
  
  // Check for drawing hands
  if (hasFlushDraw(card1, card2, boardCards)) {
    return HAND_CATEGORIES.FLUSH_DRAW;
  }
  
  if (hasStraightDraw(card1, card2, boardCards)) {
    return HAND_CATEGORIES.STRAIGHT_DRAW;
  }
  
  if (hasGutshot(card1, card2, boardCards)) {
    return HAND_CATEGORIES.GUTSHOT;
  }
  
  // Check for high card types
  if (hasAceHigh(card1, card2, boardCards)) {
    return HAND_CATEGORIES.ACE_HIGH;
  }
  
  // Default to no made hand
  return HAND_CATEGORIES.NO_MADE_HAND;
}

// Implementation of hand evaluation functions
// These are simplified versions of the original functions

function hasFlush(card1, card2, boardCards) {
  // Count the number of cards of each suit
  const suitCounts = { 's': 0, 'h': 0, 'd': 0, 'c': 0 };
  
  if (card1.suit === card2.suit) {
    suitCounts[card1.suit] += 2;
  } else {
    suitCounts[card1.suit]++;
    suitCounts[card2.suit]++;
  }
  
  for (const card of boardCards) {
    suitCounts[card.suit]++;
  }
  
  // Flush requires 5 or more cards of the same suit
  return Object.values(suitCounts).some(count => count >= 5);
}

function hasStraight(card1, card2, boardCards) {
  const rankValues = getRankValues([card1, card2, ...boardCards]);
  
  // Special case for A-5 straight (where A is treated as 1)
  if (rankValues.includes(14)) { // If there's an Ace
    const lowAceRankValues = [...rankValues];
    // Add a 1 for the Ace
    lowAceRankValues.push(1);
    // Sort and remove duplicates
    const uniqueLowAceRanks = [...new Set(lowAceRankValues)].sort((a, b) => a - b);
    
    // Check for 5 consecutive ranks
    for (let i = 0; i <= uniqueLowAceRanks.length - 5; i++) {
      if (uniqueLowAceRanks[i + 4] - uniqueLowAceRanks[i] === 4) {
        return true;
      }
    }
  }
  
  // Check for 5 consecutive ranks
  for (let i = 0; i <= rankValues.length - 5; i++) {
    if (rankValues[i + 4] - rankValues[i] === 4 && 
        rankValues[i + 1] - rankValues[i] === 1 &&
        rankValues[i + 2] - rankValues[i] === 2 &&
        rankValues[i + 3] - rankValues[i] === 3) {
      return true;
    }
  }
  
  return false;
}

// Additional hand evaluation functions (simplified)
function hasStraightFlush(card1, card2, boardCards) {
  // Implementation left simplified for brevity
  return false;
}

function hasQuads(card1, card2, boardCards) {
  // Count occurrences of each rank
  const rankCounts = {};
  
  for (const card of [card1, card2, ...boardCards]) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
  }
  
  // Check if there's at least one rank with 4 cards
  return Object.values(rankCounts).some(count => count >= 4);
}

function hasFullHouse(card1, card2, boardCards) {
  // Count occurrences of each rank
  const rankCounts = {};
  
  for (const card of [card1, card2, ...boardCards]) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
  }
  
  // Check for at least one 3-of-a-kind and another pair
  const counts = Object.values(rankCounts);
  return counts.filter(count => count >= 3).length > 0 && counts.filter(count => count >= 2).length >= 2;
}

// Additional functions (simplified implementations)
function hasTrips(card1, card2, boardCards) {
  // Check if a board card matches one of the hole cards to form trips
  // (SET is when a pocket pair hits a board card)
  if (card1.rank !== card2.rank) {
    const boardRanks = boardCards.map(card => card.rank);
    // Check if there's exactly two of a hole card rank on the board
    return (boardRanks.filter(rank => rank === card1.rank).length === 2) ||
           (boardRanks.filter(rank => rank === card2.rank).length === 2);
  }
  
  return false;
}

function hasSet(card1, card2, boardCards) {
  // Check if pocket pair hits a set
  if (card1.rank === card2.rank) {
    for (const boardCard of boardCards) {
      if (boardCard.rank === card1.rank) {
        return true;
      }
    }
  }
  
  return false;
}

function hasTwoPair(card1, card2, boardCards) {
  // Count occurrences of each rank
  const rankCounts = {};
  
  for (const card of [card1, card2, ...boardCards]) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
  }
  
  // Count the number of pairs
  let pairCount = 0;
  for (const count of Object.values(rankCounts)) {
    if (count === 2) {
      pairCount++;
    }
  }
  
  return pairCount >= 2;
}

function hasOverPair(card1, card2, boardCards) {
  // Check if hole cards are a pocket pair
  if (card1.rank === card2.rank) {
    // Get highest board rank
    const highestBoardRank = Math.max(...boardCards.map(card => getRankValue(card.rank)));
    // Check if pocket pair is higher than any board card
    return getRankValue(card1.rank) > highestBoardRank;
  }
  
  return false;
}

function hasTopPair(card1, card2, boardCards) {
  // Get the highest board rank
  const boardRanks = boardCards.map(card => getRankValue(card.rank));
  const highestBoardRank = Math.max(...boardRanks);
  
  // Check if one of the hole cards matches the highest board rank
  return (getRankValue(card1.rank) === highestBoardRank || 
          getRankValue(card2.rank) === highestBoardRank);
}

function hasMiddlePair(card1, card2, boardCards) {
  // Get sorted board ranks
  const boardRanks = boardCards.map(card => getRankValue(card.rank)).sort((a, b) => b - a);
  
  // Check for board of length 3 (flop) or more
  if (boardRanks.length >= 3) {
    // Middle card on flop is at index 1
    const middleBoardRank = boardRanks[1];
    
    // Check if one of the hole cards matches the middle board rank
    return (getRankValue(card1.rank) === middleBoardRank || 
            getRankValue(card2.rank) === middleBoardRank);
  }
  
  return false;
}

function hasWeakPair(card1, card2, boardCards) {
  // Get the lowest board rank
  const boardRanks = boardCards.map(card => getRankValue(card.rank));
  const lowestBoardRank = Math.min(...boardRanks);
  
  // Check if one of the hole cards matches the lowest board rank
  return (getRankValue(card1.rank) === lowestBoardRank || 
          getRankValue(card2.rank) === lowestBoardRank);
}

function hasUnderPair(card1, card2, boardCards) {
  // Check if hole cards are a pocket pair
  if (card1.rank === card2.rank) {
    // Get the lowest board rank
    const boardRanks = boardCards.map(card => getRankValue(card.rank));
    const lowestBoardRank = Math.min(...boardRanks);
    
    // Check if the pair is lower than the lowest board rank
    return getRankValue(card1.rank) < lowestBoardRank;
  }
  
  return false;
}

function hasAceHigh(card1, card2, boardCards) {
  // Check if one of the hole cards is an Ace
  return card1.rank === 'A' || card2.rank === 'A';
}

function hasFlushDraw(card1, card2, boardCards) {
  // Count the number of cards of each suit
  const suitCounts = { 's': 0, 'h': 0, 'd': 0, 'c': 0 };
  
  if (card1.suit === card2.suit) {
    suitCounts[card1.suit] += 2;
  } else {
    suitCounts[card1.suit]++;
    suitCounts[card2.suit]++;
  }
  
  for (const card of boardCards) {
    suitCounts[card.suit]++;
  }
  
  // Flush draw requires 4 cards of the same suit
  return Object.values(suitCounts).some(count => count === 4);
}

function hasStraightDraw(card1, card2, boardCards) {
  const allCards = [card1, card2, ...boardCards];
  
  // Get ranks and sort them
  const ranks = allCards.map(card => getRankValue(card.rank));
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  
  // Special case for Ace-low straight
  if (uniqueRanks.includes(14)) { // Ace
    const lowAceRanks = [...uniqueRanks.filter(r => r !== 14), 1];
    const sortedLowAceRanks = [...new Set(lowAceRanks)].sort((a, b) => a - b);
    
    // Check for 4 consecutive ranks
    for (let i = 0; i <= sortedLowAceRanks.length - 4; i++) {
      if (sortedLowAceRanks[i + 3] - sortedLowAceRanks[i] === 3) {
        return true;
      }
    }
  }
  
  // Check for 4 consecutive ranks
  for (let i = 0; i <= uniqueRanks.length - 4; i++) {
    if (uniqueRanks[i + 3] - uniqueRanks[i] === 3) {
      return true;
    }
  }
  
  return false;
}

function hasGutshot(card1, card2, boardCards) {
  const allCards = [card1, card2, ...boardCards];
  
  // Get ranks and sort them
  const ranks = allCards.map(card => getRankValue(card.rank));
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  
  // Check for gaps in the sequence
  for (let i = 0; i <= uniqueRanks.length - 4; i++) {
    // Check for sequences with exactly one gap
    const gaps = [
      uniqueRanks[i+1] - uniqueRanks[i] - 1,
      uniqueRanks[i+2] - uniqueRanks[i+1] - 1,
      uniqueRanks[i+3] - uniqueRanks[i+2] - 1
    ];
    
    const totalGaps = gaps.reduce((a, b) => a + b, 0);
    const hasExactlyOneGap = totalGaps === 1 && gaps.filter(g => g > 0).length === 1;
    
    if (hasExactlyOneGap && uniqueRanks[i+3] - uniqueRanks[i] <= 5) {
      return true;
    }
  }
  
  // Special case for Ace-low gutshot
  if (uniqueRanks.includes(14)) { // Ace
    const lowAceRanks = [...uniqueRanks.filter(r => r !== 14), 1].sort((a, b) => a - b);
    
    for (let i = 0; i <= lowAceRanks.length - 4; i++) {
      // Check for sequences with exactly one gap
      const gaps = [
        lowAceRanks[i+1] - lowAceRanks[i] - 1,
        lowAceRanks[i+2] - lowAceRanks[i+1] - 1,
        lowAceRanks[i+3] - lowAceRanks[i+2] - 1
      ];
      
      const totalGaps = gaps.reduce((a, b) => a + b, 0);
      const hasExactlyOneGap = totalGaps === 1 && gaps.filter(g => g > 0).length === 1;
      
      if (hasExactlyOneGap && lowAceRanks[i+3] - lowAceRanks[i] <= 5) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Analyzes board texture to understand the characteristics of the board
 * @param {Array} board - Array of board cards (e.g., ["Ah", "Kc", "Qd"])
 * @returns {Object} Board texture analysis
 */
function analyzeBoardTexture(board) {
  // Parse board cards
  const boardCards = board.map(card => ({ rank: card[0], suit: card[1] }));
  
  // Determine texture (monotone, two-tone, rainbow)
  const suits = boardCards.map(card => card.suit);
  const uniqueSuits = [...new Set(suits)];
  
  let texture;
  if (uniqueSuits.length === 1) {
    texture = BOARD_TEXTURES.MONOTONE;
  } else if (uniqueSuits.length === 2) {
    texture = BOARD_TEXTURES.TWO_TONE;
  } else {
    texture = BOARD_TEXTURES.RAINBOW;
  }
  
  // Determine if board is paired
  const ranks = boardCards.map(card => card.rank);
  const uniqueRanks = [...new Set(ranks)];
  const isPaired = uniqueRanks.length < boardCards.length;
  
  // Determine pair type (pair, trips)
  const rankCounts = {};
  ranks.forEach(rank => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });
  
  const pairType = isPaired ? 
    (Math.max(...Object.values(rankCounts)) === 3 ? 'trips' : 'paired') : 
    'unpaired';
  
  // Determine high card
  const rankValues = boardCards.map(card => getRankValue(card.rank));
  const highestRankValue = Math.max(...rankValues);
  const highestRankIndex = rankValues.indexOf(highestRankValue);
  const highCard = ranks[highestRankIndex];
  
  // Determine archetype based on rank distribution
  const sortedRankValues = [...rankValues].sort((a, b) => b - a);
  
  let archetype;
  // Define rank ranges
  const isHigh = rank => rank >= 10; // T, J, Q, K, A
  const isMid = rank => rank >= 6 && rank <= 9; // 6, 7, 8, 9
  const isLow = rank => rank <= 5; // 2, 3, 4, 5
  
  // Categorize each card
  const cardCategories = sortedRankValues.map(rank => {
    if (isHigh(rank)) return 'high';
    if (isMid(rank)) return 'mid';
    return 'low';
  });
  
  // Determine archetype based on the categories
  if (cardCategories.length === 3) { // For flop
    const archetypeKey = cardCategories.join('_').toUpperCase();
    archetype = BOARD_ARCHETYPES[archetypeKey] || 'unknown';
  } else {
    archetype = 'unknown'; // For turn/river or other board sizes
  }
  
  // Create full name description
  const highCardName = highCard === 'A' ? 'Ace' : 
                      highCard === 'K' ? 'King' : 
                      highCard === 'Q' ? 'Queen' : 
                      highCard === 'J' ? 'Jack' : 
                      highCard === 'T' ? 'Ten' : `${highCard}`;
  
  const pairedText = isPaired ? 
    (pairType === 'trips' ? 'trips' : 'paired') : '';
  
  const fullName = `${board.join('')} (${highCardName}-high ${texture} ${pairedText} ${archetype})`.trim();
  
  // Find relevant high cards that are similar to the current high card
  const relevantHighCards = findRelevantHighCards(highCard, archetype);
  
  return {
    archetype,
    texture,
    highCard: `${highCardName}-high`,
    highCardRank: highCard,
    relevantHighCards: relevantHighCards.length > 0 ? 
                      [highCard, ...relevantHighCards.filter(card => card !== highCard)] : 
                      [highCard],
    fullName,
    rawBoard: board.join(''),
    isPaired,
    pairType
  };
}

/**
 * Determines the wetness of a board (dry, semi-wet, wet)
 * @param {Array} board - Array of board cards
 * @param {Object} boardTexture - Board texture analysis from analyzeBoardTexture
 * @returns {string} Board wetness description
 */
function getBoardWetness(board, boardTexture) {
  // Determine if board is dry, semi-wet, or wet based on texture and connectedness
  if (!boardTexture) return "medium";
  
  // Parse board cards
  const boardCards = board.map(card => ({ rank: card[0], suit: card[1] }));
  
  // Check for monotone boards
  if (boardTexture.texture === 'monotone') {
    return "wet";
  }
  
  // Check for paired boards
  const ranks = boardCards.map(card => card.rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size < boardCards.length) {
    return "semi-wet"; // Paired boards are semi-wet
  }
  
  // Check for connectedness
  const rankValues = boardCards.map(card => getRankValue(card.rank)).sort((a, b) => a - b);
  const isConnected = rankValues[rankValues.length - 1] - rankValues[0] <= 4;
  
  // Check for high cards (Broadway cards)
  const hasBroadwayCards = rankValues.some(rank => rank >= 10);
  
  if (isConnected && boardTexture.texture !== 'rainbow') {
    return "wet"; // Connected and two-tone/monotone boards are wet
  } else if (isConnected || boardTexture.texture !== 'rainbow' || hasBroadwayCards) {
    return "semi-wet"; // Connected or two-tone or Broadway-heavy boards are semi-wet
  } else {
    return "dry"; // Disconnected rainbow boards are dry
  }
}

/**
 * Parses action data from combo data
 * @param {string} actionData - Action data string from comboData
 * @param {number} potSize - Current pot size
 * @returns {Object} Parsed actions with frequencies and EVs
 */
function parseActions(actionData, potSize) {
  const actions = {};
  const actionParts = actionData.split(';');
  
  for (const part of actionParts) {
    const [action, frequency, ev] = part.split(':');
    
    if (action.startsWith('R ') || action.startsWith('B ')) {
      // Extract bet/raise size
      const sizeMatch = action.match(/[RB] (\d+(\.\d+)?)/);
      if (sizeMatch) {
        const sizeBB = parseFloat(sizeMatch[1]);
        const potPercentage = Math.round((sizeBB / potSize) * 100);
        
        const actionType = action.startsWith('R') ? 'raise' : 'bet';
        const actionKey = `${actionType}${potPercentage}%`;
        
        actions[actionKey] = {
          frequency: parseFloat(frequency),
          ev: parseFloat(ev)
        };
      }
    } else if (action === 'C') {
      actions['call'] = {
        frequency: parseFloat(frequency),
        ev: parseFloat(ev)
      };
    } else if (action === 'F') {
      actions['fold'] = {
        frequency: parseFloat(frequency),
        ev: parseFloat(ev)
      };
    } else if (action === 'X') {
      actions['check'] = {
        frequency: parseFloat(frequency),
        ev: parseFloat(ev)
      };
    }
  }
  
  return actions;
}

/**
 * Finds relevant high cards that match the same archetype pattern
 * 
 * @param {string|object} highCard - The original high card on the board
 * @param {string} archetype - The board archetype (e.g., 'high-high-low')
 * @returns {Array} Array of relevant high cards in rank order
 */
function findRelevantHighCards(highCard, archetype) {
  // Convert highCard to value if it's a string
  const highCardValue = typeof highCard === 'string' ? getRankValue(highCard) : highCard;
  const highCardRank = typeof highCard === 'string' ? highCard : null;
  
  // Default to empty array if inputs are invalid
  if (!highCardValue || !archetype) {
    return [];
  }
  
  // Define card tier groupings
  const HIGH_CARDS = ['A', 'K', 'Q', 'J']; // Ranks considered "high"
  const MID_CARDS = ['T', '9', '8'];       // Ranks considered "mid"
  const LOW_CARDS = ['7', '6', '5', '4', '3', '2']; // Ranks considered "low"
  
  // Determine which tier the original high card belongs to
  let sourceTier = 'low';
  if (HIGH_CARDS.includes(highCardRank)) {
    sourceTier = 'high';
  } else if (MID_CARDS.includes(highCardRank)) {
    sourceTier = 'mid';
  }
  
  // Parse the archetype to understand board structure
  const archetypeCategories = archetype.split('-');
  const isHighLowLowArchetype = archetype === 'high-low-low';
  const isHighMidLowArchetype = archetype === 'high-mid-low';
  const isHighHighLowArchetype = archetype === 'high-high-low';
  
  // Get the appropriate card set based on tier and archetype
  let relevantCards = [];
  
  // For High Card in High-Low-Low board archetype (e.g. K55r, Q22r, J33r)
  // Any high card should be a good substitute 
  if (sourceTier === 'high' && isHighLowLowArchetype) {
    relevantCards = HIGH_CARDS.filter(card => card !== highCardRank);
  }
  // For High Card in High-Mid-Low archetype (e.g. K95r, Q84r)
  else if (sourceTier === 'high' && isHighMidLowArchetype) {
    relevantCards = HIGH_CARDS.filter(card => card !== highCardRank);
  }
  // For High Card in High-High-Low archetype (e.g. KQ3r, AJ4r)
  else if (sourceTier === 'high' && isHighHighLowArchetype) {
    relevantCards = HIGH_CARDS.filter(card => card !== highCardRank);
  }
  // For Mid Card archetypes
  else if (sourceTier === 'mid') {
    relevantCards = MID_CARDS.filter(card => card !== highCardRank);
  }
  // For Low Card archetypes
  else if (sourceTier === 'low') {
    // We could add more specific substitutions for low cards,
    // but for now, just return other low cards in the same range
    const cardValue = getRankValue(highCardRank);
    const similarLowCards = LOW_CARDS.filter(card => {
      const value = getRankValue(card);
      return Math.abs(value - cardValue) <= 2 && card !== highCardRank;
    });
    relevantCards = similarLowCards;
  }
  
  // Sort by descending rank value
  return relevantCards.sort((a, b) => getRankValue(b) - getRankValue(a));
}

module.exports = {
  RANKS,
  SUITS,
  HAND_CATEGORIES,
  HAND_CATEGORY_NAMES,
  BOARD_TEXTURES,
  BOARD_ARCHETYPES,
  getRankValue,
  getRankValues,
  getLogicalHandRepresentation,
  categorizeHand,
  analyzeBoardTexture,
  getBoardWetness,
  parseActions,
  findRelevantHighCards
}; 