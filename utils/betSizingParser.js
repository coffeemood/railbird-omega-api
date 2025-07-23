/**
 * Bet Sizing Parser Utility
 * Parses action strings from solver nodes and extracts normalized bet sizing information
 */

/**
 * Parse action string and extract bet sizing information
 * @param {string} actionStr - Action string like "Bet 9.75" or "Bet 0.25x" or "Raise 2.5x"
 * @param {number} solverPotBB - Solver's pot size in BB (for calculating pot fraction from BB amounts)
 * @param {number} actualPotBB - Actual hand's pot size in BB (from snapshot)
 * @param {number} bbSize - Big blind size in chips
 * @returns {Object} Parsed action with sizing information
 */
function parseActionSizing(actionStr, solverPotBB, actualPotBB, bbSize = 2) {
  // Default result for non-bet actions
  const result = {
    action: actionStr,
    actionType: null,
    sizing: null
  };

  // Check for non-bet actions
  if (['Check', 'Fold', 'Call'].includes(actionStr)) {
    result.actionType = actionStr.toLowerCase();
    return result;
  }

  // Regex patterns for different action formats
  const potRelativeRegex = /^(Bet|Raise)\s+([\d.]+)x$/;  // "Bet 0.75x"
  const bbAmountRegex = /^(Bet|Raise)\s+([\d.]+)$/;      // "Bet 9.75"
  
  let actionType, amountBB, potFraction;

  // Try pot-relative format first (Turn/River)
  const potRelativeMatch = actionStr.match(potRelativeRegex);
  if (potRelativeMatch) {
    actionType = potRelativeMatch[1].toLowerCase();
    potFraction = parseFloat(potRelativeMatch[2]);
    // For pot-relative format, calculate BB amount using actual hand's pot
    amountBB = potFraction * actualPotBB;
  } else {
    // Try BB amount format (Flop)
    const bbAmountMatch = actionStr.match(bbAmountRegex);
    if (bbAmountMatch) {
      actionType = bbAmountMatch[1].toLowerCase();
      amountBB = parseFloat(bbAmountMatch[2]);
      // For BB format, calculate pot fraction using solver's pot (since that's what the BB amount is relative to)
      potFraction = solverPotBB > 0 ? amountBB / solverPotBB : 0;
    } else {
      // Unrecognized format, return original
      return result;
    }
  }

  // Calculate chip amount based on actual hand's pot in chips
  const actualPotChips = actualPotBB * bbSize;
  const amountChips = Math.round(potFraction * actualPotChips);

  result.actionType = actionType;
  result.sizing = {
    bb: Number(amountBB.toFixed(2)),
    potFraction: Number(potFraction.toFixed(3)),
    chips: amountChips,
    // Add sizing category for tag generation
    category: getSizingCategory(potFraction)
  };

  return result;
}

/**
 * Categorize bet sizing for strategic analysis
 * @param {number} potFraction - Bet size as fraction of pot
 * @returns {string} Sizing category
 */
function getSizingCategory(potFraction) {
  if (potFraction < 0.33) return 'small';
  if (potFraction < 0.5) return 'medium-small';
  if (potFraction < 0.75) return 'medium';
  if (potFraction < 1.0) return 'large';
  if (potFraction < 1.5) return 'overbet';
  return 'massive-overbet';
}

/**
 * Parse all actions in an array and add sizing information
 * @param {Array} actions - Array of action objects with 'action', 'frequency', 'ev'
 * @param {number} solverPotBB - Solver's pot size in BB
 * @param {number} actualPotBB - Actual hand's pot size in BB
 * @param {number} bbSize - Big blind size in chips
 * @returns {Array} Actions with parsed sizing
 */
function parseActionArray(actions, solverPotBB, actualPotBB, bbSize = 2) {
  if (!actions || !Array.isArray(actions)) return [];
  
  return actions.map(actionObj => {
    const parsed = parseActionSizing(
      actionObj.action,
      solverPotBB,
      actualPotBB,
      bbSize
    );
    
    return {
      ...actionObj,
      actionType: parsed.actionType,
      sizing: parsed.sizing
    };
  });
}

/**
 * Format action with sizing for display
 * @param {Object} parsedAction - Action object with sizing
 * @param {string} format - Display format: 'bb', 'chips', 'fraction'
 * @returns {string} Formatted action string
 */
function formatActionWithSizing(parsedAction, format = 'fraction') {
  if (!parsedAction.sizing) return parsedAction.action;
  
  const { actionType, sizing } = parsedAction;
  const capitalizedType = actionType.charAt(0).toUpperCase() + actionType.slice(1);
  
  switch (format) {
    case 'bb':
      return `${capitalizedType} ${sizing.bb}`;
    case 'chips':
      return `${capitalizedType} ${sizing.chips}`;
    case 'fraction':
      return `${capitalizedType} ${sizing.potFraction}x`;
    default:
      return parsedAction.action;
  }
}

module.exports = {
  parseActionSizing,
  parseActionArray,
  getSizingCategory,
  formatActionWithSizing
};