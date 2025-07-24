/**
 * TagGenerationService.js
 * 
 * A modular service for generating concise strategic tags from SolverBlock data.
 * These tags replace verbose JSON structures in LLM prompts, reducing token usage
 * by 80-90% while preserving strategic accuracy.
 * 
 * Tag Categories:
 * - [ACTION:*] - Recommended GTO actions and their purpose
 * - [HAND:*] - Hero's hand strength, type, and features
 * - [BOARD:*] - Board texture and dynamics
 * - [RANGE:*] - Range advantage and composition
 * - [BLOCKER:*] - Card removal effects
 * - [STRAT:*] - High-level strategic concepts
 * - [MIX:*] - Mixed strategy reasoning
 * - [REASONING:*] - Enhanced strategic reasoning
 */

class TagGenerationService {
  constructor(options = {}) {
    this.tagPriority = options.tagPriority || 'balanced'; // 'concise', 'balanced', 'verbose'
    this.enableReasoning = options.enableReasoning !== false;
    this.maxTagsPerCategory = options.maxTagsPerCategory || 5;
    this.enableDebug = options.enableDebug || false;
  }

  /**
   * Main entry point - generates all tags for a solver block
   * @param {Object} solverBlock - The enriched solver data
   * @param {Object} snapshotContext - Additional context (street, pot, actions)
   * @returns {Array<string>} Array of strategic tags
   */
  generateTags(solverBlock, snapshotContext = {}) {
    if (!solverBlock) {
      return [];
    }

    const tags = [];
    
    // Core tag generation by category
    tags.push(...this.generateActionTags(solverBlock));
    tags.push(...this.generateHandTags(solverBlock));
    tags.push(...this.generateBoardTags(solverBlock, snapshotContext));
    tags.push(...this.generateRangeTags(solverBlock));
    tags.push(...this.generateBlockerTags(solverBlock, snapshotContext));
    tags.push(...this.generateSPRTags(solverBlock, snapshotContext));
    tags.push(...this.generatePotOddsTags(solverBlock, snapshotContext));
    tags.push(...this.generatePositionTags(solverBlock));
    tags.push(...this.generateStrategyTags(solverBlock, snapshotContext));
    tags.push(...this.generateMixTags(solverBlock));
    
    // Enhanced reasoning tags if enabled
    if (this.enableReasoning && solverBlock.heroRange && solverBlock.comboStrategy) {
      tags.push(...this.generateReasoningTags(solverBlock, snapshotContext));
    }
    
    // Apply tag prioritization and filtering
    return this.prioritizeTags(tags);
  }

  /**
   * Generate [ACTION:*] tags based on optimal strategy
   */
  generateActionTags(solverBlock) {
    const tags = [];
    const { optimalStrategy, comboStrategy, rangeAdvantage, heroRange } = solverBlock;
    
    if (!optimalStrategy?.recommendedAction) {
      return tags;
    }
    
    const action = optimalStrategy.recommendedAction.action;
    const ev = optimalStrategy.recommendedAction.ev;
    
    // Get range composition for contextual reasoning
    const rangeComp = this.analyzeRangeComposition(heroRange);
    
    // Parse action type - handle both shorthand and full names
    if (this.isCheckAction(action)) {
      // Determine check reason with range context
      if (comboStrategy?.archetype) {
        const { madeTier, pairSubtype, drawFlags } = comboStrategy.archetype;
        
        // Strong hand check with range protection context
        if (['StraightFlush', 'Quads', 'FullHouse', 'Flush'].includes(madeTier) && rangeComp.isAirHeavy) {
          tags.push('[ACTION:CHECK:PROTECT_RANGE]');
        } else if (madeTier === 'Trips' || madeTier === 'FullHouse') {
          tags.push('[ACTION:CHECK:TRAP]');
        } else if (madeTier === 'Pair' && pairSubtype === 'MiddlePair') {
          tags.push('[ACTION:CHECK:POT_CONTROL]');
        } else if (drawFlags?.length > 0) {
          tags.push('[ACTION:CHECK:REALIZE_EQ]');
        } else {
          tags.push('[ACTION:CHECK:WEAK]');
        }
      } else {
        tags.push('[ACTION:CHECK:STANDARD]');
      }
    } else if (this.isBetAction(action)) {
      // Add bet sizing context
      const sizing = optimalStrategy.recommendedAction.sizing;
      if (sizing && sizing.category) {
        tags.push(`[BETSIZE:${sizing.category.toUpperCase()}:${(sizing.potFraction * 100).toFixed(0)}%]`);
      }
      
      // Enhanced bet reasoning using turn-into-bluff logic
      const handStrength = this.getHandStrength(comboStrategy);
      
      if (comboStrategy?.archetype) {
        const { madeTier, pairSubtype, drawFlags } = comboStrategy.archetype;
        
        // Value hands
        if (this.isValueHand(comboStrategy)) {
          if (sizing?.category === 'small') {
            tags.push('[ACTION:BET:VALUE_INDUCE]');
          } else if (sizing?.category === 'overbet' || sizing?.category === 'massive-overbet') {
            tags.push('[ACTION:BET:VALUE_POLARIZE]');
          } else {
            tags.push('[ACTION:BET:VALUE_STRONG]');
          }
        } 
        // Medium strength hands - distinguish thin value vs turn-into-bluff
        else if (handStrength === 'medium' && !this.isTurningIntoBluff(solverBlock)) {
          // This is thin value betting
          if (sizing?.category === 'small' || sizing?.category === 'medium-small') {
            tags.push('[ACTION:BET:VALUE_THIN]');
          } else {
            tags.push('[ACTION:BET:VALUE_PROTECT]');
          }
        } 
        // Enhanced turn-into-bluff detection
        else if (this.isTurningIntoBluff(solverBlock)) {
          tags.push('[ACTION:BET:TURN_INTO_BLUFF]');
        } 
        // Semi-bluff with draws
        else if (drawFlags?.length > 0 && madeTier === 'HighCard') {
          tags.push('[ACTION:BET:SEMI_BLUFF]');
        } 
        // Pure bluff with weak hands
        else if (handStrength === 'weak') {
          if (sizing?.category === 'overbet' || sizing?.category === 'massive-overbet') {
            tags.push('[ACTION:BET:BLUFF_POLARIZED]');
          } else {
            tags.push('[ACTION:BET:BLUFF]');
          }
        } 
        // Protection betting on wet boards
        else if (solverBlock.boardAnalysis?.textureTags?.includes('wet')) {
          tags.push('[ACTION:BET:PROTECTION]');
        } else {
          tags.push('[ACTION:BET:STANDARD]');
        }
      } else {
        tags.push('[ACTION:BET:STANDARD]');
      }
    } else if (this.isCallAction(action)) {
      // Determine call reason
      if (comboStrategy?.equityVsRange > 50) {
        tags.push('[ACTION:CALL:POT_ODDS]');
      } else {
        tags.push('[ACTION:CALL:BLUFF_CATCH]');
      }
    } else if (this.isFoldAction(action)) {
      tags.push(`[ACTION:FOLD:${(+(optimalStrategy.recommendedAction.frequency).toFixed(0))}%]`);
    } else if (this.isRaiseAction(action)) {
      // Add raise sizing context
      const sizing = optimalStrategy.recommendedAction.sizing;
      if (sizing && sizing.category) {
        tags.push(`[RAISESIZE:${sizing.category.toUpperCase()}:${(sizing.potFraction * 100).toFixed(0)}%]`);
      }
      
      // Determine raise reason
      if (comboStrategy?.archetype) {
        const { madeTier, drawFlags } = comboStrategy.archetype;
        if (['Trips', 'Straight', 'Flush'].includes(madeTier)) {
          if (sizing?.category === 'overbet' || sizing?.category === 'massive-overbet') {
            tags.push('[ACTION:RAISE:VALUE_POLARIZED]');
          } else {
            tags.push('[ACTION:RAISE:VALUE]');
          }
        } else if (drawFlags?.length > 0) {
          tags.push('[ACTION:RAISE:SEMI_BLUFF]');
        } else {
          if (sizing?.category === 'overbet' || sizing?.category === 'massive-overbet') {
            tags.push('[ACTION:RAISE:BLUFF_POLARIZED]');
          } else {
            tags.push('[ACTION:RAISE:BLUFF]');
          }
        }
      } else {
        tags.push('[ACTION:RAISE:STANDARD]');
      }
    } else if (this.isAllInAction(action)) {
      tags.push('[ACTION:ALLIN:COMMITTED]');
    }
    
    return tags;
  }

  /**
   * Generate [HAND:*] tags based on combo strategy and hand features
   */
  generateHandTags(solverBlock) {
    const tags = [];
    const { comboStrategy, handFeatures, rangeAdvantage } = solverBlock;
    
    // Use comboStrategy as primary source (it includes archetype data)
    const hand = comboStrategy || handFeatures;
    if (!hand) return tags;
    
    // Handle both old format and new archetype format
    let madeTier, pairSubtype, drawFlags, displayName, equityVsRange;
    
    if (hand.archetype) {
      // New archetype format
      madeTier = hand.archetype.madeTier;
      pairSubtype = hand.archetype.pairSubtype;
      drawFlags = hand.archetype.drawFlags;
      displayName = hand.archetype.displayName;
      equityVsRange = hand.equityVsRange;
    } else {
      // Old format
      madeTier = hand.madeTier;
      pairSubtype = hand.pairSubtype;
      drawFlags = hand.drawFlags;
      displayName = hand.categoryName || hand.category;
      equityVsRange = hand.equityVsRange;
    }
    
    // Hand type tags based on madeTier and drawFlags
    if (['StraightFlush', 'Quads', 'FullHouse', 'Flush', 'Straight', 'Trips'].includes(madeTier)) {
      tags.push('[HAND:TYPE:VALUE_PREMIUM]');
    } else if (madeTier === 'TwoPair' || (madeTier === 'Pair' && ['TopPair', 'OverPair'].includes(pairSubtype))) {
      tags.push('[HAND:TYPE:VALUE_MARGINAL]');
    } else if (drawFlags?.includes('COMBO_DRAW') || 
               (drawFlags?.includes('FLUSH_DRAW') && drawFlags.includes('OESD'))) {
      tags.push('[HAND:TYPE:DRAW_STRONG]');
    } else if (drawFlags?.includes('FLUSH_DRAW') || drawFlags?.includes('OESD') || 
               drawFlags?.includes('GUTSHOT') || drawFlags?.includes('DOUBLE_GUT')) {
      tags.push('[HAND:TYPE:DRAW_WEAK]');
    } else if (madeTier === 'Pair' && ['MiddlePair', 'WeakPair'].includes(pairSubtype)) {
      tags.push('[HAND:TYPE:VALUE_WEAK]');
    } else if (madeTier === 'HighCard' && (!drawFlags || drawFlags.length === 0)) {
      tags.push('[HAND:TYPE:AIR]');
    }
    
    // Archetype tag using display name
    if (displayName) {
      tags.push(`[HAND:ARCHETYPE:${displayName}]`);
    }
    
    // Feature tags based on draw characteristics
    if (drawFlags && drawFlags.length > 0) {
      if (drawFlags.length >= 2) {
        tags.push('[HAND:FEATURES:MULTI_DRAW]');
      }
      // Check for combo draws
      if (drawFlags.includes('COMBO_DRAW')) {
        tags.push('[HAND:FEATURES:COMBO_DRAW]');
      }
      // Check for backdoor draws
      if (drawFlags.includes('BACKDOOR_FD')) {
        tags.push('[HAND:FEATURES:BACKDOOR_POTENTIAL]');
      }
      // Check for straight draw types
      if (drawFlags.includes('DOUBLE_GUT')) {
        tags.push('[HAND:FEATURES:DOUBLE_BELLY_BUSTER]');
      }
      if (madeTier !== 'HighCard' && drawFlags.length > 0) {
        tags.push('[HAND:FEATURES:REDRAW_POTENTIAL]');
      }
    }
    
    // Blocker relevance
    if (solverBlock.blockerImpact?.valueBlockedPct > 20 || solverBlock.blockerImpact?.bluffsUnblockedPct > 80) {
      tags.push('[HAND:FEATURES:BLOCKER_RELEVANT]');
    }
    
    // Vulnerability assessment
    if (madeTier === 'Pair' && solverBlock.handFeatures?.nextStreetAnalysis?.stdDev > 20) {
      tags.push('[HAND:FEATURES:VULNERABLE]');
    }
    
    return tags;
  }

  /**
   * Generate [BOARD:*] tags based on board analysis
   */
  generateBoardTags(solverBlock, snapshotContext) {
    const tags = [];
    const { boardAnalysis, handFeatures } = solverBlock;
    
    if (!boardAnalysis) return tags;
    
    const { textureTags } = boardAnalysis;
    
    // Wetness tags
    if (textureTags?.includes('monotone') || textureTags?.includes('connected')) {
      tags.push('[BOARD:WETNESS:WET]');
    } else if (textureTags?.includes('two-tone')) {
      tags.push('[BOARD:WETNESS:SEMI_WET]');
    } else if (textureTags?.includes('rainbow') || textureTags?.includes('disconnected')) {
      tags.push('[BOARD:WETNESS:DRY]');
    }
    
    // Texture tags
    if (textureTags?.includes('paired')) {
      tags.push('[BOARD:TEXTURE:PAIRED]');
    }
    
    // Dynamic assessment using next street analysis (only for flop/turn)
    const street = snapshotContext?.street;

    if (handFeatures?.nextStreetAnalysis && (street === 'FLOP' || street === 'TURN')) {
      const { stdDev, gains, losses, bestCard, worstCard } = handFeatures.nextStreetAnalysis.summary;
      if (stdDev > 15 || (gains + losses) > 30) {
        tags.push('[BOARD:NEXT_STREET:SWINGY]');
      } else {
        tags.push('[BOARD:NEXT_STREET:LIKELY_STATIC]');
      }
      
      // Add best/worst next street cards for strategic awareness
      if (bestCard) {
        const nextStreet = street === 'FLOP' ? 'TURN' : 'RIVER';
        tags.push(`[BOARD:BEST_${nextStreet}:${bestCard}]`);
      }
      if (worstCard) {
        const nextStreet = street === 'FLOP' ? 'TURN' : 'RIVER';
        tags.push(`[BOARD:WORST_${nextStreet}:${worstCard}]`);
      }
    }
    
    return tags;
  }

  /**
   * Generate [RANGE:*] tags based on range analysis
   */
  generateRangeTags(solverBlock) {
    const tags = [];
    const { rangeAdvantage, heroRange, villainRange } = solverBlock;
    
    if (!rangeAdvantage) return tags;
    
    const { equityDelta, valueDelta } = rangeAdvantage;
    
    // Range advantage tags
    if (equityDelta > 10) {
      tags.push('[RANGE:ADVANTAGE:HERO_STRONG]');
    } else if (equityDelta > 3) {
      tags.push('[RANGE:ADVANTAGE:HERO_SLIGHT]');
    } else if (equityDelta >= -3 && equityDelta <= 3) {
      tags.push('[RANGE:ADVANTAGE:NEUTRAL]');
    } else if (equityDelta < -10) {
      tags.push('[RANGE:ADVANTAGE:VILLAIN_STRONG]');
    } else {
      tags.push('[RANGE:ADVANTAGE:VILLAIN_SLIGHT]');
    }
    
    // Advantage reason
    if (valueDelta > 5) {
      tags.push('[RANGE:REASON:VALUE_ADVANTAGE]');
    } else if (heroRange?.categories && villainRange?.categories) {
      // Check for nut advantage
      const heroNuts = this.countNutHands(heroRange.categories);
      const villainNuts = this.countNutHands(villainRange.categories);
      if (heroNuts > villainNuts * 1.2) {
        tags.push('[RANGE:REASON:NUT_ADVANTAGE]');
      }
    }
    
    // Range composition tags
    if (heroRange) {
      const composition = this.analyzeRangeStructure(heroRange);
      if (composition.polarized) {
        tags.push('[RANGE:HERO:POLARIZED]');
      } else if (composition.condensed) {
        tags.push('[RANGE:HERO:CONDENSED]');
      }
    }
    
    if (villainRange) {
      const villainComp = this.analyzeRangeStructure(villainRange);
      if (villainComp.polarized) {
        tags.push('[RANGE:VILLAIN:POLARIZED]');
      } else if (villainComp.condensed) {
        tags.push('[RANGE:VILLAIN:CONDENSED]');
      }

      // if (villainComp.capped) {
      //   tags.push('[RANGE:VILLAIN:CAPPED]');
      // } else {
      //   tags.push('[RANGE:VILLAIN:UNCAPPED]');
      // }
    }
    
    return tags;
  }

  /**
   * Generate [BLOCKER:*] tags based on blocker impact with strategic context
   */
  generateBlockerTags(solverBlock, snapshotContext) {
    const tags = [];
    const { blockerImpact, optimalStrategy, comboStrategy } = solverBlock;
    
    if (!blockerImpact) return tags;
    
    // Only generate blocker tags for strategically relevant situations
    if (!this.shouldAnalyzeBlockers(solverBlock, snapshotContext)) {
      return tags;
    }

    const actionType = this.getActionType(optimalStrategy?.recommendedAction?.action);
    const handStrength = this.getHandStrength(comboStrategy);
    
    // Generate contextual blocker tags with specific examples
    if (actionType === 'bluffing' || actionType === 'semi_bluffing') {
      // Bluffing: want to block villain's calling range and unblock folds
      if (blockerImpact.valueBlockedPct > 15) {
        const blockedExamples = this.getBlockerExamples(blockerImpact, 'value');
        tags.push(`[BLOCKER:VALUE:${blockedExamples}:GOOD_BLUFF]`);
      }
      
      if (blockerImpact.bluffsUnblockedPct > 75) {
        const unblockedExamples = this.getBlockerExamples(blockerImpact, 'bluffs');
        tags.push(`[UNBLOCKED:FOLDS:${unblockedExamples}]`);
      }
      
    } else if (actionType === 'bluff_catching' || ((actionType === 'calling' || actionType === 'folding') && (handStrength === 'marginal' || handStrength === 'weak'))) {
      // Bluff catching: want to block villain's value and unblock bluffs
      if (blockerImpact.valueBlockedPct > 20) {
        const blockedExamples = this.getBlockerExamples(blockerImpact, 'value');
        tags.push(`[BLOCKER:VALUE:${blockedExamples}:GOOD_BLUFFCATCH]`);
      }
      
      if (blockerImpact.bluffsUnblockedPct > 80) {
        const unblockedExamples = this.getBlockerExamples(blockerImpact, 'bluffs');
        tags.push(`[UNBLOCKER:BLUFFS:${unblockedExamples}]`);
      }
      
    } else if (actionType === 'value_betting' && handStrength === 'medium') {
      // Thin value: blocking nuts can be good or bad depending on context
      if (blockerImpact.valueBlockedPct > 25) {
        const blockedExamples = this.getBlockerExamples(blockerImpact, 'nuts');
        if (this.isNutBlockingGood(solverBlock)) {
          tags.push(`[BLOCKER:NUTS:${blockedExamples}:GOOD_VALUE]`);
        } else {
          tags.push(`[BLOCKER:NUTS:${blockedExamples}:BLOCKS_CALLS]`);
        }
      }
      
    } else if (handStrength === 'marginal' && this.isTurningIntoBluff(solverBlock)) {
      // Turning marginal hand into bluff
      if (blockerImpact.valueBlockedPct > 12) {
        const blockedExamples = this.getBlockerExamples(blockerImpact, 'value');
        tags.push(`[BLOCKER:VALUE:${blockedExamples}:TURN_TO_BLUFF]`);
      }
    }
    
    // Draw blocking effects (always relevant if significant)
    if (blockerImpact.topBlocked?.some(cat => this.isDrawCategory(cat))) {
      const drawExamples = this.getBlockerExamples(blockerImpact, 'draws');
      if (drawExamples) {
        tags.push(`[BLOCKER:DRAWS:${drawExamples}:PROTECTION]`);
      }
    }
    
    // Add specific nut blocking analysis using enhanced board data
    const nutBlockerTags = this.analyzeNutBlockers(solverBlock, snapshotContext);
    tags.push(...nutBlockerTags);
    
    return tags;
  }

  /**
   * Generate [SPR:*] tags based on Stack-to-Pot Ratio from actual hand
   */
  generateSPRTags(solverBlock, snapshotContext) {
    const tags = [];
    
    // Get pot and stack information from actual hand (snapshotContext)
    const potBB = snapshotContext.potBB || 1;
    const effectiveStackBB = snapshotContext.effectiveStackBB || 100;
    
    // Calculate SPR
    const spr = effectiveStackBB / potBB;
    
    // SPR category tags
    if (spr < 2) {
      tags.push('[SPR:SHALLOW:<2]');
      // Add strategic implications for shallow SPR
      if (this.isValueHand(solverBlock.comboStrategy)) {
        tags.push('[SPR:STRATEGY:COMMITTED]');
      }
    } else if (spr < 6) {
      tags.push(`[SPR:MEDIUM:${spr.toFixed(1)}]`);
      // Medium SPR - protection becomes important
      if (solverBlock.comboStrategy?.archetype?.madeTier === 'Pair') {
        tags.push('[SPR:STRATEGY:PROTECTION_PRIORITY]');
      }
    } else if (spr < 13) {
      tags.push(`[SPR:DEEP:${spr.toFixed(1)}]`);
      // Deep SPR - multi-street play
      if (this.isValueHand(solverBlock.comboStrategy)) {
        tags.push('[SPR:STRATEGY:BUILD_POT]');
      }
    } else {
      tags.push(`[SPR:VERY_DEEP:${spr.toFixed(1)}]`);
      // Very deep - maximum maneuverability
      tags.push('[SPR:STRATEGY:MULTI_STREET_PLAY]');
    }
    
    return tags;
  }

  /**
   * Generate [POTODDS:*] tags when hero is facing a bet or raise
   */
  generatePotOddsTags(solverBlock, snapshotContext) {
    const tags = [];
    
    // Check if pot odds info is available in snapshot context
    const potOdds = snapshotContext.potOdds;
    if (!potOdds || !potOdds.isFacingBet) {
      return tags;
    }
    
    const { potOddsCategory, potOddsRatio, impliedOddsPercentage } = potOdds;
    
    // Primary pot odds category tag
    tags.push(`[POTODDS:${potOddsCategory}]`);
    
    // Specific pot odds ratio tag  
    tags.push(`[POTODDS:RATIO:${potOddsRatio}_NEED:${impliedOddsPercentage}%]`);
    
    return tags;
  }

  /**
   * Generate [POSITION:*] tags
   */
  generatePositionTags(solverBlock) {
    const tags = [];
    
    if (solverBlock.nextToAct === 'ip') {
      tags.push('[POSITION:IP]');
    } else if (solverBlock.nextToAct === 'oop') {
      tags.push('[POSITION:OOP]');
    }
    
    return tags;
  }

  /**
   * Generate [STRAT:*] tags based on strategic concepts
   */
  generateStrategyTags(solverBlock, snapshotContext) {
    const tags = [];
    const { optimalStrategy, comboStrategy, rangeAdvantage } = solverBlock;
    
    // Determine primary strategic goal
    const action = optimalStrategy?.recommendedAction?.action || '';
    
    if (action.includes('bet') || action.includes('B ')) {
      if (comboStrategy?.madeTier && this.isValueHand(comboStrategy)) {
        tags.push('[STRAT:GOAL:EXTRACT_VALUE]');
      } else if (solverBlock.boardAnalysis?.textureTags?.includes('wet')) {
        tags.push('[STRAT:GOAL:DENY_EQUITY]');
      }
    } else if (action.includes('check') || action.includes('call')) {
      if (comboStrategy?.drawFlags?.length > 0) {
        tags.push('[STRAT:GOAL:REALIZE_EQUITY]');
      }
    }
    
    // Strategic concepts
    if (action.includes('check') && this.isStrongHand(comboStrategy)) {
      tags.push('[STRAT:CONCEPT:RANGE_PROTECTION]');
    }
    
    if (rangeAdvantage?.equityDelta > 10 && this.hasNutAdvantage(solverBlock)) {
      tags.push('[STRAT:CONCEPT:LEVERAGE_NUTS]');
    }
    
    if (comboStrategy?.madeTier === 'Pair' && ['MiddlePair', 'WeakPair'].includes(comboStrategy.pairSubtype)) {
      tags.push('[STRAT:CONCEPT:POT_CONTROL]');
    }
    
    // Simple range-level strategic indicators
    if (this.isBetAction(action)) {
      tags.push('[STRAT:RANGE_BET]');
    } else if (this.isCheckAction(action)) {
      tags.push('[STRAT:PURE_CHECK]');
    }
    
    return tags;
  }

  /**
   * Generate [MIX:*] tags for mixed strategies
   */
  generateMixTags(solverBlock) {
    const tags = [];
    const { optimalStrategy, comboStrategy, heroRange, boardAnalysis } = solverBlock;
    
    // Check comboStrategy for mixed strategy (more reliable)
    if (comboStrategy?.topActions && comboStrategy.topActions.length >= 2) {
      const primary = comboStrategy.topActions[0];
      const secondary = comboStrategy.topActions[1];
      
      if (secondary.frequency > 20) {
        // Add frequency ratio tag
        tags.push(`[MIX:FREQ:${primary.frequency.toFixed(0)}/${secondary.frequency.toFixed(0)}]`);
        
        // Analyze range composition for context
        const rangeComp = this.analyzeRangeComposition(heroRange);
        
        // Determine mixed strategy type with sophisticated reasoning
        if (this.isBetAction(primary.action) && this.isCheckAction(secondary.action)) {
          if (rangeComp.isAirHeavy || rangeComp.isMarginalHeavy) {
            tags.push('[MIX:BET_CHECK:PROTECT_WEAK_RANGE]');
          } else {
            tags.push('[MIX:BET_CHECK:RANGE_BALANCE]');
          }
        } else if (this.isCheckAction(primary.action) && this.isBetAction(secondary.action)) {
          tags.push('[MIX:CHECK_BET:DECEPTIVE_LINE]');
        } else if (this.isBetAction(primary.action) && this.isBetAction(secondary.action)) {
          // Size variation strategy
          const size1 = primary.sizing?.category;
          const size2 = secondary.sizing?.category;
          if (size1 && size2 && size1 !== size2) {
            tags.push('[MIX:SIZE_VARIATION:UNPREDICTABILITY]');
          } else {
            tags.push('[MIX:BET_SIZING]');
          }
        }
        
        // EV-based reasoning
        if (Math.abs(primary.ev - secondary.ev) < 0.5) {
          tags.push('[MIX:REASON:EV_INDIFFERENT]');
        } else if (primary.ev - secondary.ev > 2) {
          tags.push('[MIX:REASON:EXPLOITATIVE_OPTION]');
        } else {
          tags.push('[MIX:REASON:GTO_BALANCE]');
        }
        
        // Context-based mixing reasons
        if (boardAnalysis?.textureTags?.includes('wet') && 
            comboStrategy.archetype?.drawFlags?.length > 0) {
          tags.push('[MIX:CONTEXT:DRAW_HEAVY_BOARD]');
        }
      }
    } else if (optimalStrategy?.actionFrequencies) {
      // Fallback to optimal strategy with enhanced analysis
      const significantActions = optimalStrategy.actionFrequencies.filter(a => a.frequency > 0.1);
      
      if (significantActions.length >= 2) {
        const evs = significantActions.map(a => a.ev);
        const maxEv = Math.max(...evs);
        const minEv = Math.min(...evs);
        
        if (maxEv - minEv < 0.5) {
          tags.push('[MIX:REASON:EV_INDIFFERENT]');
        } else {
          tags.push('[MIX:REASON:GTO_BALANCE]');
        }
        
        // Add action types being mixed
        const actionTypes = significantActions.map(a => {
          if (this.isBetAction(a.action)) return 'BET';
          if (this.isCheckAction(a.action)) return 'CHECK';
          if (this.isCallAction(a.action)) return 'CALL';
          if (this.isRaiseAction(a.action)) return 'RAISE';
          if (this.isAllInAction(a.action)) return 'ALLIN';
          if (this.isFoldAction(a.action)) return 'FOLD';
        }).filter((v, i, a) => a.indexOf(v) === i);
        
        if (actionTypes.length > 1) {
          tags.push(`[MIX:ACTIONS:${actionTypes.join('_')}]`);
        }
      }
    }
    
    return tags;
  }

  /**
   * Generate enhanced [REASONING:*] tags
   */
  generateReasoningTags(solverBlock, snapshotContext) {
    const tags = [];
    
    // Range-level reasoning
    tags.push(...this.generateReasoningRangeTags(solverBlock));
    
    // Hand-level reasoning
    tags.push(...this.generateReasoningHandTags(solverBlock));
    
    return tags;
  }

  /**
   * Generate [REASONING:RANGE:*] tags with sophisticated multi-variable interplay
   */
  generateReasoningRangeTags(solverBlock) {
    const tags = [];
    const { heroRange, optimalStrategy, comboStrategy, boardAnalysis } = solverBlock;
    
    if (!heroRange) return tags;
    
    // Analyze range composition
    const composition = this.analyzeRangeComposition(heroRange);
    
    // Add composition tags with percentages
    if (composition.valuePct > 40) {
      tags.push(`[REASONING:RANGE:COMPOSITION:VALUE_HEAVY:${composition.valuePct.toFixed(0)}%]`);
    } else if (composition.drawPct > 25) {
      tags.push(`[REASONING:RANGE:COMPOSITION:DRAW_HEAVY:${composition.drawPct.toFixed(0)}%]`);
    } else if (composition.marginalPct > 30) {
      tags.push(`[REASONING:RANGE:COMPOSITION:MARGINAL_HEAVY:${composition.marginalPct.toFixed(0)}%]`);
    } else if (composition.airPct > 40) {
      tags.push(`[REASONING:RANGE:COMPOSITION:AIR_HEAVY:${composition.airPct.toFixed(0)}%]`);
    } else if (composition.isBalanced) {
      tags.push('[REASONING:RANGE:COMPOSITION:BALANCED]');
    }
    
    // Multi-variable strategy reasoning
    const action = optimalStrategy?.recommendedAction?.action || '';
    const sizing = optimalStrategy?.recommendedAction?.sizing;
    
    // Pattern: Strong hand in marginal-heavy range
    if (comboStrategy && this.isValueHand(comboStrategy) && composition.isMarginalHeavy) {
      tags.push('[REASONING:BALANCE_MARGINAL_RANGE]');
    }
    
    // Pattern: Marginal hand turning into bluff
    if (comboStrategy?.archetype?.pairSubtype === 'MiddlePair' && 
        sizing && (sizing.category === 'large' || sizing.category === 'overbet')) {
      tags.push('[REASONING:MARGINAL_TO_BLUFF]');
    }
    
    // Pattern: Check strong hand for protection
    if (this.isCheckAction(action) && this.isValueHand(comboStrategy) && composition.isAirHeavy) {
      tags.push('[REASONING:PROTECT_WEAK_RANGE]');
    }
    
    // Bet sizing in context of range composition
    if (this.isBetAction(action) && sizing) {
      if (sizing.category === 'small' && composition.isMarginalHeavy) {
        tags.push('[REASONING:RANGE:STRATEGY:SMALL_BET_MARGINAL_RANGE]');
      } else if ((sizing.category === 'overbet' || sizing.category === 'massive-overbet') && 
                 composition.valuePct > 30 && composition.airPct > 30) {
        tags.push('[REASONING:RANGE:STRATEGY:OVERBET_POLARIZED_RANGE]');
      } else if (composition.valuePct > 20 && composition.airPct > 20) {
        tags.push('[REASONING:RANGE:STRATEGY:BALANCE_BETTING]');
      }
    }
    
    // Range advantage with board texture context
    if (solverBlock.rangeAdvantage?.equityDelta > 10) {
      if (boardAnalysis?.textureTags?.includes('wet')) {
        tags.push('[REASONING:RANGE:STRATEGY:LEVERAGE_ADVANTAGE_WET_BOARD]');
      } else {
        tags.push('[REASONING:RANGE:STRATEGY:LEVERAGE_ADVANTAGE]');
      }
    }
    
    return tags;
  }

  /**
   * Generate [REASONING:HAND:*] tags
   */
  generateReasoningHandTags(solverBlock) {
    const tags = [];
    const { comboStrategy, heroRange } = solverBlock;
    
    if (!comboStrategy || !heroRange) return tags;
    
    // Hand position in range
    if (comboStrategy.ev !== undefined) {
      const evPercentile = this.calculateHandPercentileInRange(comboStrategy.ev, heroRange);
      
      if (evPercentile >= 80) {
        tags.push('[REASONING:HAND:STRENGTH:RANGE_TOP]');
      } else if (evPercentile >= 20) {
        tags.push('[REASONING:HAND:STRENGTH:RANGE_MIDDLE]');
      } else {
        tags.push('[REASONING:HAND:STRENGTH:RANGE_BOTTOM]');
      }
    }
    
    // Strategy characteristics
    if (comboStrategy.topActions?.length >= 2) {
      const freq1 = comboStrategy.topActions[0].frequency;
      if (freq1 < 80 && freq1 > 20) {
        tags.push('[REASONING:HAND:STRATEGY:MIXED_CANDIDATE]');
      } else if (freq1 >= 90) {
        tags.push('[REASONING:HAND:STRATEGY:PURE_ACTION]');
      }
    }
    
    // Special contexts - check actual action type
    if (comboStrategy.confidence === 'high' && comboStrategy.topActions?.[0]?.frequency > 70) {
      const primaryAction = comboStrategy.topActions[0].action;
      if (this.isBetAction(primaryAction)) {
        tags.push('[REASONING:HAND:STRATEGY:MANDATORY_BET]');
      } else if (this.isCheckAction(primaryAction)) {
        tags.push('[REASONING:HAND:STRATEGY:MANDATORY_CHECK]');
      } else if (this.isCallAction(primaryAction)) {
        tags.push('[REASONING:HAND:STRATEGY:MANDATORY_CALL]');
      } else if (this.isRaiseAction(primaryAction)) {
        tags.push('[REASONING:HAND:STRATEGY:MANDATORY_RAISE]');
      }
    }
    
    if (solverBlock.blockerImpact?.valueBlockedPct > 30) {
      tags.push('[REASONING:HAND:STRATEGY:EXPLOIT_BLOCKERS]');
    }
    
    return tags;
  }

  // Helper methods for blocker analysis

  /**
   * Analyze specific nut blockers using enhanced board analysis from Rust
   * @param {Object} solverBlock - Solver block with board analysis and hero info
   * @param {Object} snapshotContext - Snapshot context with additional data
   * @returns {Array} Array of specific nut blocker tags
   */
  analyzeNutBlockers(solverBlock, snapshotContext) {
    const tags = [];
    const { boardAnalysis, comboStrategy } = solverBlock;
    const heroHand = comboStrategy?.heroHand || snapshotContext?.heroCards;
    
    if (!heroHand || !boardAnalysis) return tags;

    // Parse hero cards
    const heroCards = this.parseHeroHand(heroHand);
    if (heroCards.length !== 2) return tags;

    // Nut flush blockers (using enhanced board data)
    if (boardAnalysis.flushPossible && boardAnalysis.flushSuit) {
      const nutFlushBlocker = this.checkNutFlushBlocker(heroCards, boardAnalysis.flushSuit, solverBlock.board);
      if (nutFlushBlocker) {
        tags.push(`[BLOCKER:NUT_FLUSH:${nutFlushBlocker}:BLOCKING]`);
      }
    }

    // Nut straight blockers (only if flush not possible)
    if (boardAnalysis.straightPossible && !boardAnalysis.flushPossible) {
      const nutStraightBlocker = this.checkNutStraightBlocker(heroCards, boardAnalysis);
      if (nutStraightBlocker) {
        tags.push(`[BLOCKER:NUT_STRAIGHT:${nutStraightBlocker}:BLOCKING]`);
      }
    }

    // Nut flush draw unblocking (flush possible but not made)
    if (boardAnalysis.flushPossible && boardAnalysis.flushSuit) {
      // Check if flush is draw (not made) by counting board cards of flush suit
      const flushCardCount = this.countFlushCards(solverBlock.board, boardAnalysis.flushSuit);
      
      if (flushCardCount === 3) { // Flush draw, not made flush
        const heroHasFlushCard = this.heroHasFlushCard(heroCards, boardAnalysis.flushSuit);
        if (!heroHasFlushCard) {
          tags.push(`[UNBLOCKER:NUT_FD:${boardAnalysis.flushSuit.toUpperCase()}]`);
        }
      }
    }

    return tags;
  }

  /**
   * Parse hero hand string into card objects
   * @param {string} heroHand - Hand like "AhKs"
   * @returns {Array} Array of {rank, suit} objects
   */
  parseHeroHand(heroHand) {
    if (!heroHand || heroHand.length !== 4) return [];
    return [
      { rank: heroHand[0], suit: heroHand[1].toLowerCase() },
      { rank: heroHand[2], suit: heroHand[3].toLowerCase() }
    ];
  }

  /**
   * Check if hero blocks nut flush
   * @param {Array} heroCards - Hero's cards
   * @param {string} flushSuit - The flush suit from board analysis
   * @param {Array} board - Board cards
   * @returns {string|null} Blocking card or null
   */
  checkNutFlushBlocker(heroCards, flushSuit, board) {
    // Check if hero has ace or king of flush suit
    const heroAce = heroCards.find(card => card.rank === 'A' && card.suit === flushSuit);
    const heroKing = heroCards.find(card => card.rank === 'K' && card.suit === flushSuit);
    
    // Check if board already has ace/king of flush suit
    const boardHasAce = board?.some(card => card[0] === 'A' && card[1].toLowerCase() === flushSuit);
    const boardHasKing = board?.some(card => card[0] === 'K' && card[1].toLowerCase() === flushSuit);
    
    if (heroAce && !boardHasAce) {
      return `A${flushSuit}`;
    } else if (heroKing && !boardHasAce && !boardHasKing) {
      return `K${flushSuit}`;
    }
    
    return null;
  }

  /**
   * Check if hero blocks nut straight
   * @param {Array} heroCards - Hero's cards
   * @param {Object} boardAnalysis - Enhanced board analysis from Rust
   * @returns {string|null} Blocking card or null
   */
  checkNutStraightBlocker(heroCards, boardAnalysis) {
    const heroRanks = heroCards.map(card => card.rank);
    
    // For broadway potential, check if hero has A, K, Q, J, T
    if (boardAnalysis.broadwayPotential) {
      const broadwayCards = ['A', 'K', 'Q', 'J', 'T'];
      const nutBlockers = broadwayCards.filter(rank => heroRanks.includes(rank));
      
      if (nutBlockers.length > 0) {
        // Return highest blocker
        return nutBlockers[0];
      }
    }
    
    // For wheel potential, check if hero has A or 5
    if (boardAnalysis.wheelPotential) {
      if (heroRanks.includes('A')) return 'A';
      if (heroRanks.includes('5')) return '5';
    }
    
    return null;
  }

  /**
   * Count cards of specific suit on board
   * @param {Array} board - Board cards
   * @param {string} suit - Suit to count
   * @returns {number} Count of cards of that suit
   */
  countFlushCards(board, suit) {
    if (!board || !suit) return 0;
    return board.filter(card => card.length >= 2 && card[1].toLowerCase() === suit).length;
  }

  /**
   * Check if hero has any cards of flush suit
   * @param {Array} heroCards - Hero's cards
   * @param {string} flushSuit - The flush suit
   * @returns {boolean} True if hero has flush cards
   */
  heroHasFlushCard(heroCards, flushSuit) {
    return heroCards.some(card => card.suit === flushSuit);
  }

  /**
   * Determine if blocker analysis is strategically relevant
   */
  shouldAnalyzeBlockers(solverBlock, snapshotContext) {
    const action = solverBlock.optimalStrategy?.recommendedAction?.action;
    const handStrength = this.getHandStrength(solverBlock.comboStrategy);
    
    // Always relevant for bluffing situations
    if (this.isBetAction(action) && handStrength === 'weak') return true;
    if (this.isRaiseAction(action) && handStrength === 'weak') return true;
    
    // Relevant for bluff catching (calling with marginal hands)
    if ((this.isCallAction(action) || this.isFoldAction(action)) && (handStrength === 'marginal' || handStrength === 'weak')) {
      return true;
    }
    
    // Relevant for turning hands into bluffs
    if ((this.isBetAction(action) || this.isRaiseAction(action)) && handStrength === 'marginal') {
      const sizing = solverBlock.optimalStrategy?.recommendedAction?.sizing;
      if (sizing && (sizing.category === 'large' || sizing.category === 'overbet')) return true;
    }
    
    // Relevant for thin value situations
    if ((this.isBetAction(action) || this.isRaiseAction(action)) && handStrength === 'medium') return true;
    
    return false;
  }

  /**
   * Get action type for blocker context
   */
  getActionType(action) {
    if (!action) return 'unknown';
    
    if (this.isBetAction(action) || this.isRaiseAction(action)) {
      // Need to determine if it's value or bluff based on hand strength
      return 'betting'; // Will be refined by caller
    }
    
    if (this.isCallAction(action)) return 'calling';
    if (this.isCheckAction(action)) return 'checking';
    if (this.isFoldAction(action)) return 'folding';
    
    return 'unknown';
  }

  /**
   * Get specific examples of blocked/unblocked hands
   */
  getBlockerExamples(blockerImpact, type) {
    if (!blockerImpact.topBlocked || blockerImpact.topBlocked.length === 0) return '';

    const examples = [];

    // console.log(blocked)
    
    for (const blocked of blockerImpact.topBlocked.slice(0, 3)) {
      if (type === 'value' && this.isValueCategory(blocked)) {
        const handExamples = this.extractHandExamples(blocked);
        if (handExamples) examples.push(handExamples);
      } else if (type === 'draws' && this.isDrawCategory(blocked)) {
        const handExamples = this.extractHandExamples(blocked);
        if (handExamples) examples.push(handExamples);
      } else if (type === 'nuts' && this.isNutCategory(blocked)) {
        const handExamples = this.extractHandExamples(blocked);
        if (handExamples) examples.push(handExamples);
      } else if (type === 'bluffs' && this.isBluffCategory(blocked)) {
        const handExamples = this.extractHandExamples(blocked);
        if (handExamples) examples.push(handExamples);
      }
    }
    
    return examples.slice(0, 2).join(','); // Limit to 2 examples for readability
  }

  /**
   * Extract hand examples from category
   */
  extractHandExamples(category) {
    if (!category) return null;
    
    // Try to get from combos if available
    if (category.examples && category.examples.length > 0) {
      return category.examples.slice(0, 2).join(',');
    }
    
    // Try to get from topCombos
    if (category.topCombos && category.topCombos.length > 0) {
      return category.topCombos.slice(0, 2).join('');
    }
    
    return null;
  }

  /**
   * Check if nut blocking is good in this context
   */
  isNutBlockingGood(solverBlock) {
    // Nut blocking is typically good when:
    // 1. We're betting for thin value and blocking stronger hands that would raise
    // 2. Board texture makes nuts unlikely to call anyway
    const board = solverBlock.board || [];
    const isPaired = solverBlock.boardAnalysis?.isPaired;
    
    // On paired boards, blocking boats/quads that would raise is good
    if (isPaired) return true;
    
    // On dry boards where nuts are more likely to call, blocking them is bad
    const isWetBoard = solverBlock.boardAnalysis?.textureTags?.includes('wet');
    return !isWetBoard;
  }

  /**
   * Check if hand is being turned into a bluff
   */
  isTurningIntoBluff(solverBlock) {
    const action = solverBlock.optimalStrategy?.recommendedAction?.action;
    const sizing = solverBlock.optimalStrategy?.recommendedAction?.sizing;
    const handStrength = this.getHandStrength(solverBlock.comboStrategy);
    const rangeAdvantage = solverBlock.rangeAdvantage;
    const villainComp = this.analyzeRangeComposition(solverBlock.villainRange);
    const boardAnalysis = solverBlock.boardAnalysis;
    const comboStrategy = solverBlock.comboStrategy;

    // Case 1: Weak/marginal hands with large sizing
    if ((this.isBetAction(action) || this.isRaiseAction(action)) && 
        (handStrength === 'marginal' || handStrength === 'weak') &&
        sizing && (sizing.category === 'large' || sizing.category === 'overbet')) {
      
      // Indicators of BLUFF (not thin value):
      let bluffScore = 0;
      
      if (rangeAdvantage?.equityDelta < -5) bluffScore += 2; // Range disadvantage
      if (villainComp.isValueHeavy) bluffScore += 2; // Villain strong range  
      if (boardAnalysis?.textureTags?.includes('wet')) bluffScore += 1; // Wet board
      if (comboStrategy?.topActions?.length >= 2 && 
          comboStrategy.topActions.some(a => this.isFoldAction(a.action))) bluffScore += 2; // Mixed with fold
      
      return bluffScore >= 3; // Threshold for "turning into bluff"
    }
    
    // Case 2: Made hands taking mixed fold/raise lines
    if (comboStrategy?.topActions && comboStrategy.topActions.length >= 2) {
      const primary = comboStrategy.topActions[0];
      const secondary = comboStrategy.topActions[1];
      
      if ((this.isFoldAction(primary.action) && (this.isRaiseAction(secondary.action) || this.isBetAction(secondary.action))) ||
          (this.isFoldAction(secondary.action) && (this.isRaiseAction(primary.action) || this.isBetAction(primary.action)))) {
        
        if (handStrength === 'marginal' || handStrength === 'medium') {
          const aggressiveAction = this.isRaiseAction(primary.action) || this.isBetAction(primary.action) ? primary : secondary;
          if (aggressiveAction.sizing?.category === 'large' || aggressiveAction.sizing?.category === 'overbet') {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  // Helper methods

  /**
   * Get hand strength classification
   */
  getHandStrength(comboStrategy) {

    const { madeTier, pairSubtype } = comboStrategy;
    
    if (['StraightFlush', 'Quads', 'FullHouse', 'Flush', 'Straight', 'Trips'].includes(madeTier)) {
      return 'strong';
    } else if (madeTier === 'TwoPair' || (madeTier === 'Pair' && ['TopPair', 'OverPair'].includes(pairSubtype))) {
      return 'medium';
    } else if (madeTier === 'Pair' && ['MiddlePair', 'WeakPair'].includes(pairSubtype)) {
      return 'marginal';
    } else {
      return 'weak';
    }
  }

  /**
   * Analyze range composition percentages
   */
  analyzeRangeComposition(range) {
    let valuePct = 0, drawPct = 0, marginalPct = 0, airPct = 0;
    
    if (!range || !range.categories) {
      return {
        valuePct: 0,
        drawPct: 0,
        marginalPct: 0,
        airPct: 0,
        isValueHeavy: false,
        isDrawHeavy: false,
        isAirHeavy: false,
        isMarginalHeavy: false,
        isBalanced: false
      };
    }
    
    // Handle array format (new) or object format (old)
    const categories = Array.isArray(range.categories) ? range.categories : Object.values(range.categories);
    
    for (const category of categories) {
      const pct = category.percentOfRange || 0;
      
      // Categorize based on archetype properties
      if (this.isValueCategory(category)) {
        valuePct += pct;
      } else if (this.isDrawCategory(category)) {
        drawPct += pct;
      } else if (this.isMarginalCategory(category)) {
        marginalPct += pct;
      } else {
        airPct += pct;
      }
    }
    
    return {
      valuePct,
      drawPct,
      marginalPct,
      airPct,
      isValueHeavy: valuePct > 40,
      isDrawHeavy: drawPct > 25,
      isAirHeavy: airPct > 40,
      isMarginalHeavy: marginalPct > 30,
      isBalanced: (valuePct >= 20 && valuePct <= 40) && 
                  (drawPct >= 10 && drawPct <= 30) && 
                  ((airPct + marginalPct) >= 30 && (airPct + marginalPct) <= 60)
    };
  }

  /**
   * Check if category represents value hands
   */
  isValueCategory(category) {
    // Handle new Rust BlockedCategory format with archetype
    if (category && category.archetype) {
      const { madeTier, pairSubtype } = category.archetype;
      return ['TwoPair', 'Trips', 'Straight', 'Flush', 'FullHouse', 'Quads', 'StraightFlush'].includes(madeTier) ||
        (madeTier === 'Pair' && ['TopPair', 'OverPair'].includes(pairSubtype));
    }
    // Handle direct archetype
    if (category && category.madeTier) {
      return ['TwoPair', 'Trips', 'Straight', 'Flush', 'FullHouse', 'Quads', 'StraightFlush'].includes(category.madeTier) ||
        (category.madeTier === 'Pair' && ['TopPair', 'OverPair'].includes(category.pairSubtype));
    }
    // Legacy string handling
    if (typeof category === 'string') {
      return category.match(/two pair|trips|set|straight|flush|full house|quads|top pair|overpair/i);
    }
    // Handle name-based detection for Rust format
    if (category && category.name) {
      return category.name.toLowerCase().match(/two pair|trips|set|straight|flush|full house|quads|top pair|overpair/i);
    }
    return false;
  }

  /**
   * Check if category represents draws
   */
  isDrawCategory(category) {
    // Handle new Rust BlockedCategory format with archetype
    if (category && category.archetype) {
      const { madeTier, drawFlags } = category.archetype;
      return drawFlags && drawFlags.length > 0 && madeTier === 'HighCard';
    }
    // Handle direct archetype
    if (category && category.drawFlags) {
      return category.drawFlags.length > 0 && category.madeTier === 'HighCard';
    }
    // Legacy string handling
    if (typeof category === 'string') {
      return category.match(/draw|flush draw|straight draw|oesd|gutshot/i);
    }
    // Handle name-based detection for Rust format
    if (category && category.name) {
      return category.name.toLowerCase().match(/draw|flush draw|straight draw|oesd|gutshot/i);
    }
    return false;
  }

  /**
   * Check if category represents marginal hands
   */
  isMarginalCategory(category) {
    // Handle new Rust BlockedCategory format with archetype
    if (category && category.archetype) {
      const { madeTier, pairSubtype } = category.archetype;
      return madeTier === 'Pair' && ['MiddlePair', 'WeakPair', 'BottomPair'].includes(pairSubtype);
    }
    // Handle direct archetype
    if (category && category.madeTier) {
      return category.madeTier === 'Pair' && ['MiddlePair', 'WeakPair', 'BottomPair'].includes(category.pairSubtype);
    }
    // Legacy string handling
    if (typeof category === 'string') {
      return category.match(/middle pair|weak pair|bottom pair|ace high/i);
    }
    // Handle name-based detection for Rust format
    if (category && category.name) {
      return category.name.toLowerCase().match(/middle pair|weak pair|bottom pair|ace high/i);
    }
    return false;
  }

  /**
   * Count nut-type hands in range
   */
  countNutHands(categories) {
    let nutCount = 0;
    for (const [cat, data] of Object.entries(categories)) {
      if (this.isNutCategory(cat)) {
        nutCount += data.percentOfRange || 0;
      }
    }
    return nutCount;
  }

  /**
   * Check if category represents nut-type hands
   */
  isNutCategory(category) {
    // Handle new Rust BlockedCategory format with archetype
    if (category && category.archetype) {
      const { madeTier } = category.archetype;
      return ['Trips', 'Straight', 'Flush', 'FullHouse', 'Quads', 'StraightFlush'].includes(madeTier);
    }
    // Handle direct archetype
    if (category && category.madeTier) {
      return ['Trips', 'Straight', 'Flush', 'FullHouse', 'Quads', 'StraightFlush'].includes(category.madeTier);
    }
    // Legacy string handling
    if (typeof category === 'string') {
      return category.match(/set|trips|straight|flush|full house|quads/i);
    }
    // Handle name-based detection for Rust format
    if (category && category.name) {
      return category.name.toLowerCase().match(/set|trips|straight|flush|full house|quads/i);
    }
    return false;
  }

  /**
   * Check if category represents bluff hands
   */
  isBluffCategory(category) {
    // Handle new Rust BlockedCategory format with archetype
    if (category && category.archetype) {
      const { madeTier, pairSubtype, drawFlags } = category.archetype;
      return madeTier === 'HighCard' && drawFlags && drawFlags.length > 0; // Draws
    }
    // Handle direct archetype for draws
    if (category && category.madeTier) {
      return category.madeTier === 'HighCard' && category.drawFlags && category.drawFlags.length > 0;
    }
    // Legacy string handling
    if (typeof category === 'string') {
      return category.toLowerCase().includes('bluff') || category.toLowerCase().includes('draw');
    }
    // Handle name-based detection for Rust format
    if (category && category.name) {
      return category.name.toLowerCase().includes('bluff') || category.name.toLowerCase().includes('draw');
    }
    return false;
  }

  /**
   * Analyze range structure (polarized vs condensed)
   */
  analyzeRangeStructure(range) {
    const composition = this.analyzeRangeComposition(range);
    
    return {
      polarized: composition.valuePct > 30 && composition.airPct > 30 && composition.marginalPct < 20,
      condensed: composition.marginalPct > 40,
      capped: composition.valuePct < 5
    };
  }

  /**
   * Check if hand is considered value
   */
  isValueHand(comboStrategy) {
    if (!comboStrategy) return false;
    
    // Handle archetype format
    const archetype = comboStrategy.archetype || comboStrategy;
    const { madeTier, pairSubtype } = archetype;
    
    return ['TwoPair', 'Trips', 'Straight', 'Flush', 'FullHouse', 'Quads', 'StraightFlush'].includes(madeTier) ||
      (madeTier === 'Pair' && ['TopPair', 'OverPair'].includes(pairSubtype));
  }

  /**
   * Check if hand is considered strong
   */
  isStrongHand(comboStrategy) {
    if (!comboStrategy) return false;
    
    // Handle archetype format
    const archetype = comboStrategy.archetype || comboStrategy;
    return ['Trips', 'Straight', 'Flush', 'FullHouse', 'Quads', 'StraightFlush'].includes(archetype.madeTier);
  }

  /**
   * Check for nut advantage
   */
  hasNutAdvantage(solverBlock) {
    const { heroRange, villainRange } = solverBlock;
    if (!heroRange || !villainRange) return false;
    
    const heroNuts = this.countNutHands(heroRange.categories);
    const villainNuts = this.countNutHands(villainRange.categories);
    
    return heroNuts > villainNuts * 1.5;
  }

  /**
   * Calculate hand's EV percentile within range
   */
  calculateHandPercentileInRange(handEv, range) {
    const evs = [];
    
    // Collect all EVs from range categories
    for (const catData of Object.values(range.categories)) {
      if (catData.strategy_actions && catData.strategy_actions.length > 0) {
        evs.push(catData.strategy_actions[0].ev);
      }
    }
    
    if (evs.length === 0) return 50; // Default to middle
    
    evs.sort((a, b) => a - b);
    
    // Find percentile
    let below = 0;
    for (const ev of evs) {
      if (ev < handEv) below++;
    }
    
    return (below / evs.length) * 100;
  }

  /**
   * Prioritize and filter tags based on settings
   */
  prioritizeTags(tags) {
    // Remove duplicates
    const uniqueTags = [...new Set(tags)];
    
    // Apply priority filtering based on tagPriority setting
    if (this.tagPriority === 'concise') {
      // Keep only most important tags
      return this.filterConciseTags(uniqueTags);
    } else if (this.tagPriority === 'verbose') {
      // Return all tags
      return uniqueTags;
    }
    
    // Balanced mode - apply category limits
    return this.applyBalancedFiltering(uniqueTags);
  }

  /**
   * Filter for concise mode - only essential tags
   */
  filterConciseTags(tags) {
    const essential = [
      /^\[ACTION:/,
      /^\[HAND:TYPE:/,
      /^\[RANGE:ADVANTAGE:/,
      /^\[STRAT:GOAL:/
    ];
    
    return tags.filter(tag => 
      essential.some(pattern => pattern.test(tag))
    );
  }

  /**
   * Apply balanced filtering - limit tags per category
   */
  applyBalancedFiltering(tags) {
    const categoryCounts = {};
    const filtered = [];
    
    for (const tag of tags) {
      const category = tag.split(':')[0];
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      
      if (categoryCounts[category] <= this.maxTagsPerCategory) {
        filtered.push(tag);
      }
    }
    
    return filtered;
  }

  // Action type helpers
  isCheckAction(action) {
    return action === 'X' || action === 'Check' || action.toLowerCase().includes('check');
  }
  
  isBetAction(action) {
    return action === 'B' || action.startsWith('B ') || action.toLowerCase().includes('bet') || 
           action.toLowerCase().includes('bet') || /^B\s*\d/.test(action);
  }
  
  isCallAction(action) {
    return action === 'C' || action === 'Call' || action.toLowerCase().includes('call');
  }
  
  isFoldAction(action) {
    return action === 'F' || action === 'Fold' || action.toLowerCase().includes('fold');
  }
  
  isRaiseAction(action) {
    return action === 'R' || action.startsWith('R ') || action === 'Raise' || 
           action.toLowerCase().includes('raise') || /^R\s*\d/.test(action);
  }
  
  isAllInAction(action) {
    return action === 'A' || action === 'All-in' || action.toLowerCase().includes('all-in') ||
           action.toLowerCase().includes('allin');
  }

  /**
   * Debug logging
   */
  log(message, data) {
    if (this.enableDebug) {
      console.log(`[TagGen] ${message}`, data || '');
    }
  }
}

module.exports = TagGenerationService;