const { BOARD_TEXTURE } = require('./constants');
const { getPositionBucket } = require('./position-buckets');
const { generateActionSequence } = require('./solver-node');

/**
 * Generate debug flags comparing query and result
 */
function generateDebugFlags(querySnapshot, resultPayload, queryCleanedActions, similarityScore = 0) {
  const flags = {
    // Exact matches
    matchPosition: false,
    matchPotType: false,
    matchGameType: false,
    matchActionHistory: false,
    matchBoardTexture: false,
    matchFlopArchetype: false,
    
    // Board analysis
    flopArchetype: '',
    boardTexture: '',
    
    // Action analysis
    actionLengthDiff: 0,
    actionPatternMatch: false,
    
    // Stack analysis
    stackDiff: 0,
    
    // Similarity details
    similarityScore: 0
  };
  
  // Position match - exact or bucket match
  const exactMatch = 
    querySnapshot.positions.oop.toLowerCase() === resultPayload.positions_oop.toLowerCase() &&
    querySnapshot.positions.ip.toLowerCase() === resultPayload.positions_ip.toLowerCase();
  
  const bucketMatch = 
    getPositionBucket(querySnapshot.positions.oop) === getPositionBucket(resultPayload.positions_oop) &&
    getPositionBucket(querySnapshot.positions.ip) === getPositionBucket(resultPayload.positions_ip);
  
  flags.matchPosition = exactMatch || bucketMatch;
  
  // Pot type match
  flags.matchPotType = querySnapshot.pot_type.toLowerCase() === resultPayload.pot_type.toLowerCase();
  
  // Game type match
  flags.matchGameType = querySnapshot.game_type.toLowerCase() === resultPayload.game_type.toLowerCase();
  
  // Action history comparison
  const resultCleanedActions = resultPayload.action_history || [];
  flags.actionLengthDiff = Math.abs(queryCleanedActions.length - resultCleanedActions.length);
  
  // Check if action patterns match
  flags.matchActionHistory = compareActionPatterns(queryCleanedActions, resultCleanedActions);
  flags.actionPatternMatch = getActionPatternSimilarity(queryCleanedActions, resultCleanedActions) > 0.7;
  
  // Board texture analysis for result
  flags.flopArchetype = getFlopArchetypeName(resultPayload.board);
  flags.boardTexture = getBoardTextureName(resultPayload.board);
  
  // Calculate board matches
  const queryFlopArchetype = getFlopArchetypeName(querySnapshot.board);
  const queryBoardTexture = getBoardTextureName(querySnapshot.board);
  
  flags.matchFlopArchetype = flags.flopArchetype === queryFlopArchetype;
  flags.matchBoardTexture = flags.boardTexture === queryBoardTexture;
  
  // Stack difference
  const queryStack = Math.min(querySnapshot.stack_bb, 100);
  const resultStack = resultPayload.effective_stack || 100;
  flags.stackDiff = Math.abs(queryStack - resultStack);
  
  // Set similarity score
  flags.similarityScore = similarityScore;
  
  // Add canonicalized action sequences for display
  try {
    flags.actionSequenceQuery = generateActionSequence(queryCleanedActions);
    flags.actionSequenceResult = generateActionSequence(resultCleanedActions);
  } catch (error) {
    console.warn('Action sequence generation failed:', error.message);
    flags.actionSequenceQuery = 'ERROR';
    flags.actionSequenceResult = 'ERROR';
  }
  
  return flags;
}

/**
 * Compare action patterns for exact match
 */
function compareActionPatterns(actions1, actions2) {
  if (actions1.length !== actions2.length) return false;
  
  for (let i = 0; i < actions1.length; i++) {
    const type1 = getActionType(actions1[i]);
    const type2 = getActionType(actions2[i]);
    if (type1 !== type2) return false;
  }
  
  return true;
}

/**
 * Calculate action pattern similarity (0-1)
 */
function getActionPatternSimilarity(actions1, actions2) {
  if (actions1.length === 0 && actions2.length === 0) return 1;
  if (actions1.length === 0 || actions2.length === 0) return 0;
  
  const maxLen = Math.max(actions1.length, actions2.length);
  let matches = 0;
  
  for (let i = 0; i < Math.min(actions1.length, actions2.length); i++) {
    const type1 = getActionType(actions1[i]);
    const type2 = getActionType(actions2[i]);
    if (type1 === type2) matches++;
  }
  
  return matches / maxLen;
}

/**
 * Extract action type from action string
 */
function getActionType(action) {
  const actionLower = action.toLowerCase();
  if (actionLower.startsWith('check') || actionLower.startsWith('x')) return 'check';
  if (actionLower.startsWith('call') || actionLower.startsWith('c')) return 'call';
  if (actionLower.startsWith('bet') || actionLower.startsWith('b')) return 'bet';
  if (actionLower.startsWith('raise') || actionLower.startsWith('r')) return 'raise';
  if (actionLower.startsWith('all-in') || actionLower.startsWith('allin')) return 'allin';
  if (actionLower.startsWith('fold') || actionLower.startsWith('f')) return 'fold';
  return 'unknown';
}

/**
 * Get flop archetype name from board
 */
function getFlopArchetypeName(board) {
  if (!board || board.length < 3) return 'Unknown';
  
  const ranks = board.slice(0, 3).map(card => {
    const rank = card[0];
    const value = '23456789TJQKA'.indexOf(rank);
    if (value >= 8) return 'H';      // High
    if (value >= 4) return 'M';      // Medium
    return 'L';                       // Low
  });
  
  ranks.sort();
  return ranks.join('');
}

/**
 * Get board texture description
 */
function getBoardTextureName(board) {
  if (!board || board.length < 3) return 'Unknown';
  
  const suits = board.slice(0, 3).map(card => card[1]);
  const suitCounts = {};
  suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
  
  const uniqueSuits = Object.keys(suitCounts).length;
  
  if (uniqueSuits === 1) return 'monotone';
  if (uniqueSuits === 2) return 'two-tone';
  return 'rainbow';
}

/**
 * Check if board is paired
 */
function isBoardPaired(board) {
  if (!board || board.length < 2) return false;
  
  const ranks = board.slice(0, 3).map(card => card[0]);
  const rankCounts = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  
  return Object.values(rankCounts).some(count => count >= 2);
}

/**
 * Generate a detailed comparison report
 */
function generateComparisonReport(querySnapshot, resultPayload, debugFlags) {
  const report = [];
  
  report.push('=== COMPARISON REPORT ===');
  report.push(`Positions: ${querySnapshot.positions.oop} vs ${querySnapshot.positions.ip} → ` +
    `${resultPayload.positions_oop} vs ${resultPayload.positions_ip} ` +
    `[${debugFlags.matchPosition ? '✅' : '❌'}]`);
  
  report.push(`Pot Type: ${querySnapshot.pot_type} → ${resultPayload.pot_type} ` +
    `[${debugFlags.matchPotType ? '✅' : '❌'}]`);
  
  report.push(`Actions: ${querySnapshot.action_history.join(' ')} → ` +
    `${resultPayload.action_history.join(' ')} ` +
    `[${debugFlags.matchActionHistory ? '✅' : '❌'}]`);
  
  report.push(`Board: ${querySnapshot.board.join('')} → ${resultPayload.board.join('')}`);
  report.push(`  Archetype: ${debugFlags.flopArchetype} (${debugFlags.boardTexture})`);
  
  return report.join('\n');
}

module.exports = {
  generateDebugFlags,
  compareActionPatterns,
  getActionPatternSimilarity,
  generateComparisonReport,
  getBoardTextureName,
  getFlopArchetypeName,
  getActionType,
  isBoardPaired,
};