const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { calculateRangeEquity } = require('../../utils/solver-node');

// Solves collection
const solvesCollection = new Collection('solves', {
  // No auto-increment since we use custom node_id/_id
});

/**
 * Solves Schema - Schema for solver node data
 * Handles both FLOP nodes (full data) and TURN/RIVER nodes (metadata only)
 */
const solvesSchema = {
  // Common fields
  _id: String, // UUID for flop nodes, ObjectId for turn/river nodes
  street: String,
  board: Array,
  gameType: String,
  potType: String,
  positions: Object,
  effStack: String,
  pot: Number,
  stackOOP: Number,
  stackIP: Number,
  nextToAct: String,
  actionHistory: Array,
  
  // FLOP-specific fields (full node data)
  rangeStats: Object,
  actionsOOP: Array,
  actionsIP: Array,
  comboData: Object,
  
  // TURN/RIVER-specific fields (metadata only)
  nodeIdentifier: String,
  actionHistoryFixed: Boolean,
  optimalStrategy: Object,
  s3Bucket: String,
  s3Key: String,
  version: Number,
  isTerminal: Boolean,
  totalInvestments: Array,
};

/**
 * Solves Relation Maps
 */
const solvesRelationMaps = [];

/**
 * Solves Public Fields
 * Fields that can be passed to public endpoints
 */
const solvesPublicFields = {
  _id: 1,
  street: 1,
  board: 1,
  gameType: 1,
  potType: 1,
  positions: 1,
  effStack: 1,
  pot: 1,
  stackOOP: 1,
  stackIP: 1,
  nextToAct: 1,
  actionHistory: 1,
  // Flop fields
  rangeStats: 1,
  actionsOOP: 1,
  actionsIP: 1,
  comboData: 1,
  // Turn/River fields
  nodeIdentifier: 1,
  optimalStrategy: 1,
  s3Bucket: 1,
  s3Key: 1,
  isTerminal: 1,
};

class Solves extends SuperCollection {
  constructor() {
    super(solvesCollection, solvesSchema, solvesRelationMaps, solvesPublicFields);
  }

  /**
   * Find a flop node by its _id
   * @param {string} nodeId - The node _id to search for
   * @returns {Promise<Object|null>} The flop node or null if not found
   */
  async findFlopNodeById(nodeId) {
    if (!nodeId) {
      throw new Error('Node ID is required');
    }
    
    return await this.findOneByQuery({ 
      _id: nodeId,
      street: 'FLOP'
    });
  }

  /**
   * Find a turn/river node by nodeIdentifier and optionally other criteria
   * @param {string} nodeIdentifier - The nodeIdentifier to search for
   * @param {Object} additionalCriteria - Additional search criteria
   * @returns {Promise<Object|null>} The turn/river node or null if not found
   */
  async findTurnRiverNode(nodeIdentifier, additionalCriteria = {}) {
    if (!nodeIdentifier) {
      throw new Error('Node identifier is required');
    }
    
    return await this.findOneByQuery({ 
      nodeIdentifier,
      street: { $in: ['TURN', 'RIVER'] },
      ...additionalCriteria
    });
  }

  /**
   * Find solve nodes by street
   * @param {string} street - The street (FLOP, TURN, RIVER)
   * @param {Object} options - Additional query options
   * @returns {Promise<Array>} Array of solve nodes
   */
  async findByStreet(street, options = {}) {
    const query = { street, ...options };
    return await this.findByQuery(query);
  }

  /**
   * Transform a flop node to frontend-friendly format
   * @param {Object} flopNode - The flop node from MongoDB
   * @returns {Object} Transformed node data
   */
  async transformFlopNode(flopNode) {
    if (!flopNode) return null;
    
    let rangeAdvantage;
    if (flopNode.rangeStats?.oop && flopNode.rangeStats?.ip) {
      try {
        
        const equityResult = await calculateRangeEquity(
          flopNode.rangeStats.oop,
          flopNode.rangeStats.ip,
          flopNode.board,
          flopNode.nextToAct
        );

        rangeAdvantage = JSON.parse(equityResult);
      } catch (error) {
        console.error('Error calculating range equity:', error);
        // Keep default values on error
      }
    }
    
    // Build optimal strategy from actions
    const actions = flopNode.nextToAct === 'oop' ? flopNode.actionsOOP : flopNode.actionsIP;
    let recommendedAction = { action: 'Check', ev: 0 };
    
    if (actions && actions.length > 0) {
      // Find action with highest frequency
      let bestAction = actions[0];
      let bestFreq = bestAction.frequency || 0;
      
      for (const action of actions) {
        if (action.frequency > bestFreq) {
          bestFreq = action.frequency;
          bestAction = action;
        }
      }
      
      recommendedAction = {
        action: bestAction.action,
        ev: bestAction.ev || 0
      };
    }
    
    return {
      nodeId: flopNode._id,
      street: flopNode.street,
      board: flopNode.board,
      gameType: flopNode.gameType,
      potType: flopNode.potType,
      positions: flopNode.positions,
      effStack: flopNode.effStack,
      pot: flopNode.pot,
      stackOOP: flopNode.stackOOP,
      stackIP: flopNode.stackIP,
      nextToAct: flopNode.nextToAct,
      actionHistory: flopNode.actionHistory,
      rangeStats: flopNode.rangeStats,
      actionsOOP: flopNode.actionsOOP,
      actionsIP: flopNode.actionsIP,
      comboData: flopNode.comboData,
      // Add solver block structure with calculated equity
      boardAnalysis: {
        textureTags: []
      },
      rangeAdvantage,
      optimalStrategy: {
        recommendedAction,
        actionFrequencies: actions || []
      }
    };
  }
}

module.exports = new Solves();