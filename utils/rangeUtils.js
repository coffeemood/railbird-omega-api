/**
 * Range analysis utilities
 * Based on the original range_utils.js
 */
const { 
  HAND_CATEGORIES,
  HAND_CATEGORY_NAMES,
  categorizeHand,
  getLogicalHandRepresentation,
  getRankValue
} = require('./cardUtils');

/**
 * Parses a range string from the database into a structured object
 * @param {string} rangeString - Range string in format "4h2h:0.0724,5h2h:0.3241,..."
 * @return {Object} Parsed range with combos and frequencies
 */
function parseRangeString(rangeString) {
  if (!rangeString || rangeString.trim() === '') {
    return { combos: {} };
  }

  const rangeParts = rangeString.split(',');
  const combos = {};

  for (const part of rangeParts) {
    const [combo, frequency] = part.split(':');
    if (combo && frequency) {
      combos[combo] = parseFloat(frequency);
    }
  }

  return { combos };
}

/**
 * Categorizes a range into hand categories
 * @param {Object} range - Range object with combos and frequencies
 * @param {Array} board - Array of board cards
 * @return {Object} Categorized range
 */
function categorizeRange(range, board) {
  const categories = {};
  
  // Initialize categories
  Object.values(HAND_CATEGORIES).forEach(category => {
    categories[category] = {
      hands: [],
      combos: [],
      comboCount: 0,
      frequency: 0
    };
  });
  
  // Process each combo in the range
  for (const [combo, frequency] of Object.entries(range.combos)) {
    // Skip combos with zero frequency
    if (frequency <= 0) continue;
    
    // Determine hand category
    const category = categorizeHand(combo, board);
    
    // Get logical hand representation
    const logicalHand = getLogicalHandRepresentation(combo);
    
    // Add combo to appropriate category
    categories[category].combos.push(combo);
    categories[category].comboCount++;
    categories[category].frequency += frequency;
    
    // Add logical hand if not already present
    if (!categories[category].hands.includes(logicalHand)) {
      categories[category].hands.push(logicalHand);
    }
  }
  
  // Calculate percentages and remove empty categories
  let totalFrequency = 0;
  let totalCombos = 0;
  
  for (const category of Object.values(categories)) {
    totalFrequency += category.frequency;
    totalCombos += category.comboCount;
  }
  
  // Calculate percentage of range for each category
  for (const category of Object.keys(categories)) {
    if (categories[category].comboCount === 0) {
      delete categories[category];
    } else {
      categories[category].percentOfRange = (categories[category].frequency / totalFrequency) * 100;
    }
  }
  
  return {
    categories,
    totalCombos,
    totalFrequency
  };
}

/**
 * Categorizes hands in a range for visualization purposes
 * @param {Object} range - Range data object with hand frequencies
 * @param {Array} board - Board cards
 * @returns {Object} Categories with arrays of hands
 */
function categorizeRangeForVisualization(range, board) {
  // Strategic categories for hero ranges
  const strategicCategories = {
    value: [],
    draw: [],
    bluff: [],
    air: []
  };
  
  // Strength categories for villain ranges (from HAND_CATEGORIES)
  const strengthCategories = {};
  Object.values(HAND_CATEGORIES).forEach(category => {
    strengthCategories[category] = [];
  });
  
  // Safety check for empty range
  if (!range || Object.keys(range).length === 0) {
    return {
      strategic: strategicCategories,
      strength: strengthCategories
    };
  }
  
  // Process each hand in the range
  Object.keys(range).forEach(hand => {
    const frequency = range[hand];
    
    // Skip hands with zero or undefined frequency
    if (!frequency || frequency <= 0) return;
    
    // Handle logical representation (ensure the hand is in valid format)
    let logicalHand = hand;
    
    // If the hand seems to be a specific combo (e.g., "AhKd"), convert it
    if (hand.length === 4 && (hand.includes('h') || hand.includes('c') || 
                              hand.includes('d') || hand.includes('s'))) {
      try {
        logicalHand = getLogicalHandRepresentation(hand);
      } catch (e) {
        console.warn(`Failed to get logical representation for hand: ${hand}`);
        return; // Skip this hand
      }
    }
    
    // Determine hand category based on board
    let handCategory;
    try {
      // Handle standardized notation (like "AKs", "QQ") by creating a sample specific combo
      if (hand.length <= 3) {
        // For pairs (e.g., "AA", "KK")
        if (hand.length === 2 && hand[0] === hand[1]) {
          // Convert to a specific example like "AhAs"
          const sampleCombo = `${hand[0]}h${hand[0]}s`;
          handCategory = categorizeHand(sampleCombo, board);
        } 
        // For suited hands (e.g., "AKs")
        else if (hand.endsWith('s')) {
          // Convert to a specific example like "AhKh" (same suit)
          const rank1 = hand[0];
          const rank2 = hand[1];
          const sampleCombo = `${rank1}h${rank2}h`;
          handCategory = categorizeHand(sampleCombo, board);
        }
        // For offsuit hands (e.g., "AKo")
        else if (hand.endsWith('o')) {
          // Convert to a specific example like "AhKd" (different suits)
          const rank1 = hand[0];
          const rank2 = hand[1];
          const sampleCombo = `${rank1}h${rank2}d`;
          handCategory = categorizeHand(sampleCombo, board);
        }
        else {
          // Unknown format, try default and log warning
          console.warn(`Unrecognized hand format for categorization: ${hand}`);
          handCategory = HAND_CATEGORIES.NO_MADE_HAND;
        }
      } else {
        // For specific combos like "AhKd", use directly
        handCategory = categorizeHand(hand, board);
      }
    } catch (e) {
      console.warn(`Failed to categorize hand: ${hand}, error: ${e.message}`);
      handCategory = HAND_CATEGORIES.NO_MADE_HAND; // Default to NO_MADE_HAND instead of 'AIR' string
    }
    
    // Add to strength category if not already added
    if (!strengthCategories[handCategory].includes(logicalHand)) {
      strengthCategories[handCategory].push(logicalHand);
    }
    
    // Determine strategic category (simplified logic)
    // This would be more sophisticated in a real implementation
    try {
      switch(handCategory) {
        case HAND_CATEGORIES.STRAIGHT_FLUSH:
        case HAND_CATEGORIES.QUADS:
        case HAND_CATEGORIES.FULL_HOUSE:
        case HAND_CATEGORIES.FLUSH:
        case HAND_CATEGORIES.STRAIGHT:
        case HAND_CATEGORIES.SET:
        case HAND_CATEGORIES.TRIPS:
        case HAND_CATEGORIES.TWO_PAIR:
        case HAND_CATEGORIES.TOP_PAIR:
        case HAND_CATEGORIES.OVER_PAIR:
          if (!strategicCategories.value.includes(logicalHand)) {
            strategicCategories.value.push(logicalHand);
          }
          break;
        
        case HAND_CATEGORIES.FLUSH_DRAW:
        case HAND_CATEGORIES.STRAIGHT_DRAW:
        case HAND_CATEGORIES.GUTSHOT:
          if (!strategicCategories.draw.includes(logicalHand)) {
            strategicCategories.draw.push(logicalHand);
          }
          break;
          
        case HAND_CATEGORIES.MIDDLE_PAIR:
        case HAND_CATEGORIES.WEAK_PAIR:
        case HAND_CATEGORIES.UNDER_PAIR:
        case HAND_CATEGORIES.ACE_HIGH:
          if (!strategicCategories.bluff.includes(logicalHand)) {
            strategicCategories.bluff.push(logicalHand);
          }
          break;
          
        case HAND_CATEGORIES.NO_MADE_HAND:
        default:
          if (!strategicCategories.air.includes(logicalHand)) {
            strategicCategories.air.push(logicalHand);
          }
      }
    } catch (e) {
      console.warn(`Failed to determine strategic category for hand: ${hand}`);
      // Default to air if categorization fails
      if (!strategicCategories.air.includes(logicalHand)) {
        strategicCategories.air.push(logicalHand);
      }
    }
  });
  
  // Ensure each category has at least one hand (for display purposes)
  // If all categories are empty, add a placeholder to "air"
  const allEmpty = Object.values(strategicCategories).every(arr => arr.length === 0);
  if (allEmpty && Object.keys(range).length > 0) {
    const firstHand = Object.keys(range)[0];
    strategicCategories.air.push(getLogicalHandRepresentation(firstHand));
  }
  
  return {
    strategic: strategicCategories,
    strength: strengthCategories
  };
}

/**
 * Checks if a hero hand blocks villain's range
 * @param {string} heroHand - Hero's hand in combo format (e.g., "AhKs")
 * @param {Object} villainRange - Villain's range object
 * @return {Object} Blocking information
 */
function checkRangeBlocking(heroHand, villainRange) {
  const heroCard1 = heroHand.substring(0, 2);
  const heroCard2 = heroHand.substring(2, 4);
  
  const blockedCombos = [];
  const blockedCategories = {};
  
  // Initialize blocked categories
  Object.values(HAND_CATEGORIES).forEach(category => {
    if (category && category.toLowerCase() !== 'air') { // Skip initializing 'Air' category
      blockedCategories[category] = {
        combos: [],
        frequency: 0,
        representatives: [], // Add array to store representative combos
        friendlyName: HAND_CATEGORY_NAMES[category] || category // Add friendly name
      };
    }
  });
  
  // Check each combo in villain's range
  for (const [combo, frequency] of Object.entries(villainRange.combos)) {
    const villainCard1 = combo.substring(0, 2);
    const villainCard2 = combo.substring(2, 4);
    
    // Check if hero's cards block villain's combo
    if (heroCard1 === villainCard1 || heroCard1 === villainCard2 || 
        heroCard2 === villainCard1 || heroCard2 === villainCard2) {
      blockedCombos.push(combo);
      
      // Find the category of this combo
      for (const [category, data] of Object.entries(villainRange.categories)) {
        if (category !== 'air' && data.combos.includes(combo)) { // Skip 'Air' category
          blockedCategories[category].combos.push(combo);
          blockedCategories[category].frequency += frequency;
          
          // Store up to 3 representative combos per category
          if (blockedCategories[category].representatives.length < 3) {
            const logicalHand = getLogicalHandRepresentation(combo);
            if (!blockedCategories[category].representatives.includes(logicalHand)) {
              blockedCategories[category].representatives.push(logicalHand);
            }
          }
          break;
        }
      }
    }
  }
  
  // Calculate blocking percentages
  const totalBlockedFrequency = Object.values(blockedCategories)
    .reduce((sum, data) => sum + data.frequency, 0);
  
  const blockingPercentage = (totalBlockedFrequency / villainRange.totalFrequency) * 100;
  
  // Remove empty categories
  for (const category of Object.keys(blockedCategories)) {
    if (blockedCategories[category].combos.length === 0) {
      delete blockedCategories[category];
    }
  }
  
  return {
    blockedCombos,
    blockedCategories,
    blockingPercentage,
    totalBlockedFrequency
  };
}

/**
 * Analyzes villain's range and hero's hand to generate insights
 * @param {string} heroHand - Hero's hand in combo format
 * @param {string} rangeString - Villain's range string
 * @param {Array} board - Array of board cards
 * @param {string} heroRange - Optional hero's range string for comparison
 * @return {Object} Range analysis results
 */
function analyzeRange(heroHand, rangeString, board, heroRange = null) {
  // Parse villain's range
  const villainRange = parseRangeString(rangeString);

  const heroRangeAnalysis = heroRange ? parseRangeString(heroRange) : {};
  
  // Categorize villain's range
  const categorizedRange = categorizeRange(villainRange, board);
  villainRange.categories = categorizedRange.categories;
  villainRange.totalCombos = categorizedRange.totalCombos;
  villainRange.totalFrequency = categorizedRange.totalFrequency;

  const categorizedHero = heroRangeAnalysis.combos ? categorizeRange(heroRangeAnalysis, board) : {};
  heroRangeAnalysis.categories = heroRangeAnalysis.combos ? categorizedHero.categories : {};
  heroRangeAnalysis.totalCombos = heroRangeAnalysis.combos ? categorizedHero.totalCombos : 0;
  heroRangeAnalysis.totalFrequency = heroRangeAnalysis.combos ? categorizedHero.totalFrequency : 0;
  
  // Check if hero's hand blocks villain's range
  const blockingInfo = checkRangeBlocking(heroHand, villainRange);
  
  // Categorize hero's hand
  const heroCategory = categorizeHand(heroHand, board);
  
  return {
    heroHand,
    heroCategory,
    heroCategoryName: HAND_CATEGORY_NAMES[heroCategory] || heroCategory,
    villainRange: {
      categories: villainRange.categories,
      totalCombos: villainRange.totalCombos
    },
    heroRange: {
      categories: heroRangeAnalysis.categories,
      totalCombos: heroRangeAnalysis.totalCombos
    },
    blocking: blockingInfo
  };
}

/**
 * Generates a human-readable markdown analysis of the hand and range
 * @param {Object} rangeAnalysis - Output from analyzeRange
 * @param {Object} boardTexture - Board texture analysis
 * @param {string} boardWetness - Wetness of the board
 * @returns {string} Markdown formatted analysis
 */
function generateAnalysisMarkdown(rangeAnalysis, boardTexture, boardWetness) {
  const { heroHand, heroCategory, heroCategoryName, villainRange, blocking } = rangeAnalysis;
  
  // Format hero hand
  const prettyHeroHand = `${heroHand.charAt(0)}${heroHand.charAt(2)}${heroHand.charAt(1) === heroHand.charAt(3) ? 's' : 'o'}`;
  
  let markdown = `# Hand Analysis: ${prettyHeroHand}\n\n`;
  
  // Board analysis
  markdown += `## Board: ${boardTexture.rawBoard}\n`;
  markdown += `- **Texture**: ${boardTexture.texture}\n`;
  markdown += `- **High Card**: ${boardTexture.highCard}\n`;
  markdown += `- **Wetness**: ${boardWetness}\n`;
  markdown += `- **Paired**: ${boardTexture.isPaired ? 'Yes' : 'No'}\n`;
  markdown += `- **Archetype**: ${boardTexture.archetype}\n\n`;
  
  // Hero hand analysis
  markdown += `## Your Hand: ${prettyHeroHand}\n`;
  markdown += `- **Category**: ${heroCategoryName}\n\n`;
  
  // Blocking analysis
  markdown += `## Range Blocking Analysis\n`;
  markdown += `Your hand blocks approximately **${blocking.blockingPercentage.toFixed(2)}%** of villain's range.\n\n`;
  
  // Blocked categories
  markdown += `### Blocked Categories\n`;
  
  const sortedBlockedCategories = Object.entries(blocking.blockedCategories)
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 5); // Top 5 blocked categories
  
  if (sortedBlockedCategories.length > 0) {
    for (const [category, data] of sortedBlockedCategories) {
      const percentage = (data.frequency / blocking.totalBlockedFrequency) * 100;
      markdown += `- **${data.friendlyName}**: ${percentage.toFixed(2)}% (`;
      markdown += data.representatives.join(', ');
      markdown += `)\n`;
    }
  } else {
    markdown += "- No significant range blocking detected\n";
  }
  
  markdown += `\n`;
  
  // Villain range overview
  markdown += `## Villain Range Composition\n`;
  const topCategories = Object.entries(villainRange.categories)
    .sort((a, b) => b[1].percentOfRange - a[1].percentOfRange)
    .slice(0, 5); // Top 5 categories
  
  for (const [category, data] of topCategories) {
    const displayName = HAND_CATEGORY_NAMES[category] || category;
    markdown += `- **${displayName}**: ${data.percentOfRange.toFixed(2)}% of range\n`;
    markdown += `  - Example hands: ${data.hands.slice(0, 3).join(', ')}\n`;
  }
  
  return markdown;
}

module.exports = {
  parseRangeString,
  categorizeRange,
  categorizeRangeForVisualization,
  checkRangeBlocking,
  analyzeRange,
  generateAnalysisMarkdown
}; 