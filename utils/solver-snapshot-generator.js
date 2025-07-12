const _ = require('lodash');

/**
 * Solver Snapshot Generation Module
 * Implements Phase 2 of the solver integration checklist
 * 
 * This module handles:
 * - State tracking through a poker hand
 * - Decision point detection for Hero
 * - Villain selection using primary villain heuristic
 * - SnapshotInput assembly for solver analysis
 */

/**
 * Track the game state at each point in the hand
 */
class GameStateTracker {
  constructor(hand, heroSeatIndex) {
    this.hand = hand;
    this.heroSeatIndex = heroSeatIndex;
    this.reset();
  }

  reset() {
    this.currentStreet = 'PREFLOP';
    this.boardCards = [];
    this.pot = 0;
    this.playerStacks = {};
    this.playerStatus = {};
    this.streetActions = {
      PREFLOP: [],
      FLOP: [],
      TURN: [],
      RIVER: []
    };
    
    // Initialize player stacks and status from playerChips
    if (this.hand.playerChips) {
      this.hand.playerChips.forEach((player, index) => {
        this.playerStacks[index] = player.chips;
        this.playerStatus[index] = 'active';
      });
    }
    
    // Initialize pot with blinds and antes
    const { sb = 0, bb = 0, ante = 0 } = this.hand.header || {};
    this.pot = sb + bb + (ante * (this.hand.playerChips ? this.hand.playerChips.length : 0));
  }

  /**
   * Update state based on an action
   */
  updateState(action) {
    const { playerIndex, type, amount = 0, street } = action;
    
    // Update street if changed
    if (street && street !== this.currentStreet) {
      this.currentStreet = street.toUpperCase();
    }

    // Update board cards based on street
    // hand.board is an object like { card1: "8d", card2: "9s", ... }
    if (this.hand.board && typeof this.hand.board === 'object') {
      const boardArr = [
        this.hand.board.card1,
        this.hand.board.card2,
        this.hand.board.card3,
        this.hand.board.card4,
        this.hand.board.card5
      ].filter(Boolean);

      if (this.currentStreet === 'FLOP' && this.boardCards.length === 0) {
        this.boardCards = boardArr.slice(0, 3);
      } else if (this.currentStreet === 'TURN' && this.boardCards.length === 3) {
        this.boardCards = boardArr.slice(0, 4);
      } else if (this.currentStreet === 'RIVER' && this.boardCards.length === 4) {
        this.boardCards = boardArr;
      }
    }

    // Track action in current street (only if it's an actual action, not a street change)
    if (this.streetActions[this.currentStreet] && type && playerIndex !== undefined) {
      this.streetActions[this.currentStreet].push({
        playerIndex,
        action: { type, amount }
      });
    }

    // Handle different action types
    switch (type) {
      case 'fold':
      case 'folds':
        this.playerStatus[playerIndex] = 'folded';
        break;
        
      case 'bet':
      case 'raise':
      case 'call':
        if (amount > 0) {
          this.pot += amount;
          if (this.playerStacks[playerIndex] !== undefined) {
            this.playerStacks[playerIndex] -= amount;
          }
        }
        break;
        
      case 'check':
        // No pot or stack changes
        break;
    }
  }

  /**
   * Get current game state
   */
  getState() {
    return {
      street: this.currentStreet,
      board: [...this.boardCards],
      pot: this.pot,
      playerStacks: { ...this.playerStacks },
      playerStatus: { ...this.playerStatus },
      streetActions: this.streetActions[this.currentStreet] || [],
      allStreetActions: this.streetActions
    };
  }

  /**
   * Get active players (not folded)
   */
  getActivePlayers() {
    return Object.keys(this.playerStatus)
      .filter(index => this.playerStatus[index] === 'active')
      .map(index => parseInt(index));
  }
}

/**
 * Detect decision points where it's Hero's turn to act
 */
function detectDecisionPoints(hand, heroSeatIndex) {
  const tracker = new GameStateTracker(hand, heroSeatIndex);
  const decisionPoints = [];
  
  // Process all actions in chronological order
  const allActions = hand.actionScript || [];
  
  allActions.forEach((action, index) => {
    // Skip street marker actions
    if (action.isNewStreet) {
      tracker.updateState({
        street: action.street
      });
      return;
    }
    
    // Check if this is Hero's turn to act
    if (action.playerIndex === heroSeatIndex && 
        action.action && 
        ['bet', 'raise', 'call', 'check', 'fold'].includes(action.action.type)) {
      
      // Capture state BEFORE Hero's action (current state, not after update)
      const state = tracker.getState();
      
      // Skip preflop decision points - solvers only work postflop
      if (state.street === 'PREFLOP') {
        // Update state and continue
        if (action.action) {
          tracker.updateState({
            playerIndex: action.playerIndex,
            type: action.action.type,
            amount: action.action.amount || action.action.chips || action.action.bet || 0,
            street: action.street
          });
        }
        return;
      }
      
      // Create a snapshot of actions up to this point (excluding this hero action)
      const actionsBeforeThisPoint = [];
      for (let i = 0; i < index; i++) {
        const prevAction = allActions[i];
        if (!prevAction.isNewStreet && prevAction.action) {
          actionsBeforeThisPoint.push({
            playerIndex: prevAction.playerIndex,
            action: prevAction.action,
            street: (prevAction.street || '').toUpperCase()
          });
        }
      }
      
      decisionPoints.push({
        actionIndex: index,
        state: state,
        heroAction: action,
        actionsBeforeThisPoint: actionsBeforeThisPoint
      });
    }
    
    // Update state with this action AFTER checking for decision point
    if (action.action) {
      tracker.updateState({
        playerIndex: action.playerIndex,
        type: action.action.type,
        amount: action.action.amount || action.action.chips || action.action.bet || 0,
        street: action.street
      });
    }
  });
  
  return decisionPoints;
}

/**
 * Select primary villain using the heuristic from documentation
 */
function selectPrimaryVillain(state, heroSeatIndex) {
  const activePlayers = state.playerStatus 
    ? Object.keys(state.playerStatus)
        .filter(index => state.playerStatus[index] === 'active' && parseInt(index) !== heroSeatIndex)
        .map(index => parseInt(index))
    : [];
  
  if (activePlayers.length === 0) return null;
  if (activePlayers.length === 1) return activePlayers[0];
  
  // Rule 1: Last aggressor on current street
  const streetActions = state.streetActions || [];
  for (let i = streetActions.length - 1; i >= 0; i--) {
    const action = streetActions[i];
    if ((action.action?.type === 'bet' || action.action?.type === 'raise') &&
        action.playerIndex !== heroSeatIndex &&
        activePlayers.includes(action.playerIndex)) {
      return action.playerIndex;
    }
  }
  
  // Rule 2: Positional priority - first active player to Hero's left
  // Sort active players by seat position
  const sortedPlayers = activePlayers.sort((a, b) => a - b);
  
  // Find first player after hero
  for (const player of sortedPlayers) {
    if (player > heroSeatIndex) {
      return player;
    }
  }
  
  // If no player after hero, wrap around to first player
  return sortedPlayers[0];
}

/**
 * Get the actual position name from player data
 */
function getPlayerPosition(hand, playerIndex) {
  // First try to get from playerChips array
  const playerChip = hand.playerChips?.[playerIndex];
  if (playerChip?.pos) return playerChip.pos.toLowerCase();
  
  // Then try players array
  const player = hand.players?.[playerIndex];
  if (player?.pos) return player.pos.toLowerCase();
  
  // Fallback
  return `seat${playerIndex}`;
}

/**
 * Determine IP/OOP positions between Hero and Villain
 */
function determinePositions(hand, heroSeatIndex, villainSeatIndex) {
  const heroPos = getPlayerPosition(hand, heroSeatIndex);
  const villainPos = getPlayerPosition(hand, villainSeatIndex);
  
  // Position order for determining who acts last postflop
  // BTN acts last, then CO, etc. BB acts first postflop
  const positionOrder = ['bb', 'sb', 'utg', 'utg+1', 'mp', 'mp+1', 'co', 'btn', 'bu'];
  
  const heroOrder = positionOrder.indexOf(heroPos.toLowerCase());
  const villainOrder = positionOrder.indexOf(villainPos.toLowerCase());
  
  // If position not found, use seat index as fallback
  if (heroOrder === -1 || villainOrder === -1) {
    if (heroSeatIndex > villainSeatIndex) {
      return { ip: heroPos, oop: villainPos, heroRelativePosition: 'ip' };
    } else {
      return { ip: villainPos, oop: heroPos, heroRelativePosition: 'oop' };
    }
  }
  
  // Higher order means acts later (is IP)
  if (heroOrder > villainOrder) {
    return { ip: heroPos, oop: villainPos, heroRelativePosition: 'ip' };
  } else {
    return { ip: villainPos, oop: heroPos, heroRelativePosition: 'oop' };
  }
}

/**
 * Convert action to canonical format for solver
 */
function formatActionForSolver(action, bbSize = 1) {
  // Handle both formats: direct action object or wrapped in action property
  const actionData = action.action || action;
  const type = actionData?.type;
  const amount = actionData?.amount || 0;
  
  switch (type) {
    case 'check':
      return 'Check';
    case 'fold':
      return 'Fold';
    case 'call':
      return 'Call';
    case 'bet':
      return amount > 0 ? `Bet ${(amount / bbSize).toFixed(2)}` : 'Bet';
    case 'raise':
      return amount > 0 ? `Raise ${(amount / bbSize).toFixed(2)}` : 'Raise';
    default:
      return type || 'Unknown';
  }
}

/**
 * Assemble SnapshotInput object for solver analysis
 */
function assembleSnapshotInput(decisionPoint, hand, heroSeatIndex, primaryVillain) {
  const { state } = decisionPoint;
  const { header = {} } = hand;
  const bbSize = header.bb || 1;
  
  // Calculate effective stack
  const heroStack = state.playerStacks[heroSeatIndex] || 0;
  const villainStack = state.playerStacks[primaryVillain] || 0;
  const effectiveStack = Math.min(heroStack, villainStack);
  
  // Determine positions
  const positions = determinePositions(hand, heroSeatIndex, primaryVillain);
  
  // Build pruned action history (only Hero and Primary Villain actions BEFORE this decision point)
  // Include ALL POSTFLOP actions up to this decision point
  // This gives us cumulative history: Turn includes Flop+Turn, River includes Flop+Turn+River
  // Exclude all preflop actions as solvers only work postflop
  
  const cumulativeActions = decisionPoint.actionsBeforeThisPoint
    .filter(action => {
      // Exclude preflop actions
      const actionStreet = (action.street || '').toUpperCase();
      if (actionStreet === 'PREFLOP') {
        return false;
      }
      // Only include Hero and Primary Villain actions
      return action.playerIndex === heroSeatIndex || 
             action.playerIndex === primaryVillain;
    })
    .map(action => formatActionForSolver(action, bbSize));
  
  // Determine game type and pot type
  const gameType = header.gametype === 'tournament' ? 'mtt' : 'cash';
  const potType = hand.info?.potType || 'srp';
  
  // Determine who's next to act (hero)
  const heroPosition = positions.heroRelativePosition; // This should be 'ip' or 'oop'
  
  // Get hero's hole cards
  const heroCards = hand.preflopSummary?.cards;
  const heroHand = heroCards ? `${heroCards.card1}${heroCards.card2}` : null;
  
  return {
    street: state.street,
    board: state.board,
    pot_bb: state.pot / bbSize,
    stack_bb: effectiveStack / bbSize,
    positions: {
      ip: positions.ip,
      oop: positions.oop
    },
    positions_ip: positions.ip, // Add individual position fields for filtering
    positions_oop: positions.oop, // Add individual position fields for filtering
    action_history: cumulativeActions,
    game_type: gameType,
    pot_type: potType,
    next_to_act: heroPosition, // Add this field
    heroCards: heroHand // Add hero's hole cards
  };
}

/**
 * Check if a villain is still relevant for the current decision point
 */
function isVillainRelevantForSnapshot(decisionPoint, primaryVillain, heroSeatIndex) {
  const { state, actionsBeforeThisPoint } = decisionPoint;
  
  // Check if villain is still active (not folded)
  if (state.playerStatus[primaryVillain] !== 'active') {
    return false;
  }
  
  // We only care about postflop streets for solver snapshots
  // Skip any preflop decision points entirely
  if (state.street === 'PREFLOP') {
    return false;
  } else {
    // On postflop, check if villain has made any actions on current street
    // If no actions yet on current street, that's okay - they might act after hero
    // But if there have been aggressive actions by others and villain just called/folded, 
    // they're not the primary aggressor anymore
    const aggressiveActions = actionsBeforeThisPoint.filter(action => {
      const actionStreet = (action.street || '').toUpperCase();
      const stateStreet = (state.street || '').toUpperCase();
      return actionStreet === stateStreet && 
             action.playerIndex !== heroSeatIndex &&
             ['bet', 'raise'].includes(action.action?.type);
    });
    
    // If there are aggressive actions by other players (not our primary villain),
    // then our primary villain is no longer the main aggressor
    const otherAggressors = aggressiveActions.filter(a => a.playerIndex !== primaryVillain);
    if (otherAggressors.length > 0) {
      return false;
    }
  }
  
  return true;
}

/**
 * Main function to generate snapshots for a hand
 */
function generateSnapshots(hand) {
  // Find hero seat index - it's stored in hand.info.heroSeatIndex
  let heroSeatIndex = hand.info?.heroSeatIndex;
  if (heroSeatIndex === undefined || heroSeatIndex === null) {
    // Fallback: try to find hero in playerChips array
    const heroPlayerIndex = hand.playerChips?.findIndex(player => player.hero);
    if (heroPlayerIndex === -1) {
      throw new Error('No hero found in hand');
    }
    heroSeatIndex = heroPlayerIndex;
  }
  
  // Detect all decision points
  const decisionPoints = detectDecisionPoints(hand, heroSeatIndex);
  
  // Select primary villain ONCE based on the first decision point
  let primaryVillain = null;
  let primaryVillainPosition = null;
  
  if (decisionPoints.length > 0) {
    const firstDecisionPoint = decisionPoints[0];
    primaryVillain = selectPrimaryVillain(firstDecisionPoint.state, heroSeatIndex);
    
    if (primaryVillain !== null) {
      primaryVillainPosition = getPlayerPosition(hand, primaryVillain);
    }
  }
  
  if (primaryVillain === null) {
    // No villain available in the entire hand
    return [];
  }
  
  // Generate snapshots for each decision point, but only if villain is still relevant
  const snapshots = decisionPoints.map((decisionPoint, index) => {
    // Check if the primary villain is still relevant for this snapshot
    if (!isVillainRelevantForSnapshot(decisionPoint, primaryVillain, heroSeatIndex)) {
      // Skip this snapshot - villain is no longer relevant
      return null;
    }
    
    // Assemble snapshot input
    const snapshotInput = assembleSnapshotInput(
      decisionPoint,
      hand,
      heroSeatIndex,
      primaryVillain
    );
    
    return {
      index,
      decisionPoint,
      primaryVillain,
      primaryVillainPosition,
      snapshotInput
    };
  }).filter(snapshot => snapshot !== null);
  
  return snapshots;
}

module.exports = {
  GameStateTracker,
  detectDecisionPoints,
  selectPrimaryVillain,
  assembleSnapshotInput,
  generateSnapshots,
  isVillainRelevantForSnapshot
};