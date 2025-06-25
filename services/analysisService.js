/**
 * Poker hand analysis service
 * Provides functions for retrieving random nodes and analyzing hands
 */
const cardUtils = require('../utils/cardUtils');
const rangeUtils = require('../utils/rangeUtils');
const solvesCollection = require('../db/collections/Solves');

/**
 * Gets a random solved node from the database
 * @returns {Promise<Object>} Random node document
 */
async function getRandomNode() {
  
  try {
    
    // Find documents where street is FLOP
    const query = { street: "FLOP" };
    const count = await solvesCollection.collection.countDocuments(query);
    
    // Get random node
    const randomSkip = Math.floor(Math.random() * count);
    const node = await solvesCollection.findOneByQuery(query, { skip: randomSkip });
    
    return node;
  } catch (error) {
    console.error('Error getting random node:', error);
    throw error;
  } finally {
  }
}

/**
 * Gets a random combo from a node's comboData
 * @param {Object} node - Node document from database
 * @returns {Object} Object containing selected combo and its data
 */
function getRandomCombo(node) {
  const comboData = node.comboData;
  
  if (!comboData || Object.keys(comboData).length === 0) {
    throw new Error('No combo data available');
  }
  
  // Get list of combos with nonzero frequency
  const validCombos = Object.keys(comboData).filter(combo => {
    const actions = cardUtils.parseActions(comboData[combo], node.pot);
    // Check if any action has nonzero frequency
    return Object.values(actions).some(action => action.frequency > 0);
  });
  
  if (validCombos.length === 0) {
    throw new Error('No valid combos with nonzero frequency');
  }
  
  // Select random combo
  const randomCombo = validCombos[Math.floor(Math.random() * validCombos.length)];
  
  return {
    combo: randomCombo,
    actionData: comboData[randomCombo],
    parsedActions: cardUtils.parseActions(comboData[randomCombo], node.pot)
  };
}

/**
 * Analyzes a poker hand scenario
 * @param {Object} node - Node document from database
 * @param {string} combo - Selected combo to analyze
 * @returns {Promise<Object>} Analysis results
 */
function analyzePokerHand(node, combo) {
  // Get key data from node
  const board = node.board;
  const potSize = node.pot;
  const heroPosition = node.nextToAct;
  const villainPosition = heroPosition === 'ip' ? 'oop' : 'ip';
  
  // Analyze board texture
  const boardTexture = cardUtils.analyzeBoardTexture(board);
  const boardWetness = cardUtils.getBoardWetness(board, boardTexture);
  
  // Parse hero's actions
  const heroActions = cardUtils.parseActions(node.comboData[combo], potSize);
  
  // Get villain's range
  const villainRangeString = node.rangeStats[villainPosition];
  
  // Analyze range
  const heroRange = node.rangeStats[heroPosition];
  const rangeAnalysis = rangeUtils.analyzeRange(combo, villainRangeString, board, heroRange);
  
  // Generate human-readable analysis
  const analysisMarkdown = rangeUtils.generateAnalysisMarkdown(rangeAnalysis, boardTexture, boardWetness);
  
  return {
    node: {
      _id: node._id,
      street: node.street,
      board,
      potSize,
      potType: node.potType,
      positions: node.positions,
      actionHistory: node.actionHistory
    },
    hero: {
      hand: combo,
      position: heroPosition,
      category: rangeAnalysis.heroCategoryName,
      actions: heroActions
    },
    villain: {
      position: villainPosition,
      range: {
        total: rangeAnalysis.villainRange.totalCombos,
        categories: Object.entries(rangeAnalysis.villainRange.categories)
          .sort((a, b) => b[1].percentOfRange - a[1].percentOfRange)
          .slice(0, 10)
          .map(([category, data]) => ({
            name: cardUtils.HAND_CATEGORY_NAMES[category] || category,
            percentage: data.percentOfRange,
            examples: data.hands.slice(0, 3)
          }))
      }
    },
    board: {
      cards: board,
      texture: boardTexture,
      wetness: boardWetness
    },
    blocking: {
      percentage: rangeAnalysis.blocking.blockingPercentage,
      categories: Object.entries(rangeAnalysis.blocking.blockedCategories)
        .sort((a, b) => b[1].frequency - a[1].frequency)
        .slice(0, 5)
        .map(([category, data]) => ({
          name: data.friendlyName,
          percentage: (data.frequency / rangeAnalysis.blocking.totalBlockedFrequency) * 100,
          examples: data.representatives
        }))
    },
    analysisMarkdown
  };
}

/**
 * Get random poker hand analysis
 * @returns {Promise<Object>} Complete analysis
 */
async function getRandomHandAnalysis() {
  try {
    // Get random node
    const node = await getRandomNode();
    
    // Get random combo
    const { combo } = getRandomCombo(node);
    
    // Analyze hand
    return analyzePokerHand(node, combo);
  } catch (error) {
    console.error('Error in getRandomHandAnalysis:', error);
    throw error;
  }
}

/**
 * Get range data for visualization
 * @param {Object} node - Node document from database
 * @param {string} position - Position to get range for ('ip' or 'oop')
 * @returns {Promise<Object>} Range data for visualization
 */
async function getRangeData(node, position) {
  try {
    // Get the range for the specified position
    const rangeString = node.rangeStats[position];
    
    // Parse the range into hand frequencies
    const rangeObj = rangeUtils.parseRangeString(rangeString);
    
    // Convert specific combos to standardized notation and consolidate frequencies
    const standardizedRangeData = {};
    
    // Process each combo to standardize notation
    Object.entries(rangeObj.combos).forEach(([combo, frequency]) => {
      // Use cardUtils to get logical hand representation (e.g., "AhKd" -> "AKo")
      const standardHand = cardUtils.getLogicalHandRepresentation(combo);
      
      // Add frequency to standardized hand
      if (!standardizedRangeData[standardHand]) {
        standardizedRangeData[standardHand] = frequency;
      } else {
        standardizedRangeData[standardHand] += frequency;
      }
    });
    
    // Get the board cards
    const board = node.board;
    
    // Categorize hands in the range
    const categorizedData = rangeUtils.categorizeRangeForVisualization(standardizedRangeData, board);
    
    // Format the data for visualization
    const compositionData = {};
    
    // For both hero and villain positions, use hand strength categories
    Object.entries(categorizedData.strength).forEach(([category, hands]) => {
      if (hands.length > 0) {
        const friendlyCategoryName = cardUtils.HAND_CATEGORY_NAMES[category] || category;
        compositionData[friendlyCategoryName] = buildCategoryData(hands, standardizedRangeData);
      }
    });
    
    return {
      rangeData: standardizedRangeData,
      compositionData
    };
  } catch (error) {
    console.error('Error in getRangeData:', error);
    throw error;
  }
}

/**
 * Helper function to build category data for visualization
 * @param {Array} hands - Array of hands in the category
 * @param {Object} rangeData - Range data with frequencies
 * @returns {Object} Formatted category data
 */
function buildCategoryData(hands, rangeData) {
  // Group hands by type (pairs, suited, offsuit)
  const handGroups = {
    pairs: [],
    suited: [],
    offsuit: []
  };
  
  // Calculate combos and group hands
  let comboCount = 0;
  let totalEV = 0;
  
  hands.forEach(hand => {
    const frequency = rangeData[hand] || 0;
    if (frequency > 0) {
      // Determine hand type and add to group
      if (hand.length === 2) {
        handGroups.pairs.push(hand);
      } else if (hand.endsWith('s')) {
        handGroups.suited.push(hand);
      } else if (hand.endsWith('o')) {
        handGroups.offsuit.push(hand);
      }
      
      // Calculate combos
      const handCombos = getHandCombos(hand) * frequency;
      comboCount += handCombos;
      
      // Calculate EV (mock data for now)
      const mockEV = mockHandEV(hand);
      totalEV += mockEV * handCombos;
    }
  });
  
  // Calculate average EV
  const avgEV = comboCount > 0 ? totalEV / comboCount : 0;
  
  // Calculate percentage of total possible combos (1326)
  // Use a reasonable percentage calculation
  const percentage = comboCount > 0 ? (comboCount / 1326) * 100 : 0;
  
  return {
    hands,
    handCount: hands.length,
    comboCount: Math.round(comboCount),
    percentage: percentage,
    ev: avgEV,
    handGroups
  };
}

/**
 * Helper function to get hand combos
 * @param {string} hand - Hand in standard notation (e.g. "AKs", "QQ")
 * @returns {number} Number of combos
 */
function getHandCombos(hand) {
  if (!hand) return 0;
  
  if (hand.length === 2) {
    return 6; // C(4,2) = 6 combinations for pairs
  } else if (hand.endsWith('s')) {
    return 4; // 4 combinations for suited hands (one for each suit)
  } else if (hand.endsWith('o')) {
    return 12; // 4*3 = 12 combinations for offsuit hands
  }
  
  return 0;
}

/**
 * Mock EV calculation (to be replaced with actual calculation)
 * @param {string} hand - Hand in standard notation 
 * @returns {number} EV value
 */
function mockHandEV(hand) {
  // Simple logic to generate mock EV values
  if (!hand) return 0;
  
  const handRanks = hand.replace('s', '').replace('o', '').split('');
  const rankValues = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  
  let ev = 0;
  
  // Pairs have higher EV
  if (handRanks[0] === handRanks[1]) {
    ev = (rankValues[handRanks[0]] - 2) * 0.5 - 2;
  } else {
    // Non-pairs
    const highRank = Math.max(rankValues[handRanks[0]], rankValues[handRanks[1]]);
    const lowRank = Math.min(rankValues[handRanks[0]], rankValues[handRanks[1]]);
    const gap = highRank - lowRank;
    const suited = hand.endsWith('s') ? 1 : 0;
    
    ev = (highRank - 7) * 0.3 - gap * 0.4 + suited * 1.2 - 2;
  }
  
  // Add some randomness
  ev += (Math.random() * 0.6 - 0.3);
  
  return ev;
}

module.exports = {
  getRandomNode,
  getRandomCombo,
  analyzePokerHand,
  getRandomHandAnalysis,
  getRangeData
}; 