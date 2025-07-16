const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { calculateRangeEquity } = require('../../utils/solver-node');

// Import additional dependencies for the new functionality
const Hands = require('./Hands');
const ModularSolverNodeService = require('../../utils/ModularSolverNodeService');
const { buildSolverBlockFromNodeData } = require('../../utils/solverNodeService');
const { generateSnapshots } = require('../../utils/solver-snapshot-generator');
const { findSimilarNode } = require('../../utils/vectorSearch');

// Import vector testing pipeline utilities for enhanced local search
const { ACTION_ENCODING, ACTION_SYMBOLS } = require('../../utils/constants');

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
    
    // Initialize modular solver service for enhanced analysis
    this.solver = new ModularSolverNodeService({
      enableMetrics: true,
      defaultBucket: process.env.SOLVER_S3_BUCKET || 'solver-nodes'
    });
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
   * Main function to prepare all snapshots for a hand
   * @param {string} handId - The hand ID to process
   * @param {Object} options - Optional configuration
   * @returns {Promise<Array>} Array of enriched snapshots
   */
  async prepareSnapshots(handId, options = {}) {
    try {
      // 1. Get hand data
      const hand = await Hands.findById(+handId);
      if (!hand) {
        throw new Error(`Hand not found: ${handId}`);
      }
      
      // 2. Generate snapshots using existing generator
      const snapshots = generateSnapshots(hand);
      
      // 3. Separate by street
      const flopSnapshots = snapshots.filter(s => s.snapshotInput.street === 'FLOP');
      const turnSnapshots = snapshots.filter(s => s.snapshotInput.street === 'TURN');
      const riverSnapshots = snapshots.filter(s => s.snapshotInput.street === 'RIVER');
      
      // 4. Vector search (exclude RIVER)
      const vectorTargets = [...flopSnapshots, ...turnSnapshots];
      const vectorResults = await Promise.all(
        vectorTargets.map(snapshot => findSimilarNode(snapshot.snapshotInput))
      );
      
      // 5. Enrich each snapshot with zst caching
      const enrichedSnapshots = [];
      const zstCache = new Map(); // Cache for nodeDataArray by vectorResult metadata
      
      // Process FLOP + TURN and collect TURN vector results
      const turnVectorResults = [];
      for (let i = 0; i < vectorTargets.length; i++) {
        const snapshot = vectorTargets[i];
        const vectorResult = vectorResults[i];
        const enriched = await this.enrichSnapshot(snapshot, vectorResult, zstCache);
        enrichedSnapshots.push(enriched);
        
        // Collect TURN vector results for RIVER reuse
        if (snapshot.snapshotInput.street === 'TURN') {
          turnVectorResults.push({ snapshot, vectorResult });
        }
      }
      
      // Process RIVER (reuse TURN vector results and cached zst data)
      for (const riverSnapshot of riverSnapshots) {
        const turnResult = turnVectorResults[turnVectorResults.length - 1]
        const enriched = await this.enrichRiverSnapshot(riverSnapshot, turnResult, zstCache);
        enrichedSnapshots.push(enriched);
      }
      
      return enrichedSnapshots;
      
    } catch (error) {
      console.error('Error preparing snapshots:', error);
      throw new Error(`Failed to prepare snapshots for hand ${handId}: ${error.message}`);
    }
  }

  /**
   * Enrich a FLOP or TURN snapshot with solver data
   * @param {Object} snapshot - The snapshot to enrich
   * @param {Object} vectorResult - Vector search result
   * @param {Map} zstCache - Cache for nodeDataArray to avoid duplicate downloads
   * @returns {Promise<Object>} Enriched snapshot
   */
  async enrichSnapshot(snapshot, vectorResult, zstCache = new Map()) {
    if (!vectorResult?.nodeMetadata) {
      return { ...snapshot, solver: null };
    }
    
    const street = snapshot.snapshotInput.street;
    let solverBlock;
    
    try {
      if (street === 'FLOP') {
        // Get from MongoDB
        const flopNode = await this.findFlopNodeById(vectorResult.nodeMetadata.original_id);
        if (!flopNode) {
          console.warn(`FLOP node not found: ${vectorResult.nodeMetadata._id || vectorResult.nodeMetadata.original_id}`);
          return { ...snapshot, solver: null };
        }
        solverBlock = await this.buildSolverBlockFromFlopNode(flopNode, snapshot.snapshotInput.heroCards, vectorResult.similarityScore);
      } else {
        // TURN: unpack zst and cache for RIVER reuse
        const cacheKey = this.getCacheKey(vectorResult.nodeMetadata);
        let nodeDataArray = zstCache.get(cacheKey);
        
        if (!nodeDataArray) {
          nodeDataArray = await this.solver.fetchAndDecodeNode(vectorResult.nodeMetadata);
          zstCache.set(cacheKey, nodeDataArray);
          console.log(`Cached zst data for key: ${cacheKey}`);
        } else {
          console.log(`Reusing cached zst data for key: ${cacheKey}`);
        }
        
        // Pass the node_identifier from vector result for direct lookup
        const nodeId = vectorResult.nodeMetadata?.node_identifier || vectorResult.nodeMetadata?._id;
        console.log(`Using nodeId for TURN lookup: ${nodeId}`);
        console.log(`Sample nodes in array:`, nodeDataArray.slice(0, 3).map(n => ({
          node_id: n.node_id,
          node_identifier: n.node_identifier,
          board: n.board
        })));
        
        // Search for the exact nodeId in the entire array
        const targetNodeFound = nodeDataArray.find(n => n.node_id === nodeId);
        if (targetNodeFound) {
          console.log(`✅ Found target node "${nodeId}":`, {
            node_id: targetNodeFound.node_id,
            board: targetNodeFound.board,
            street: targetNodeFound.street
          });
        } else {
          console.log(`❌ Node "${nodeId}" not found in array of ${nodeDataArray.length} nodes`);
          console.log('All node_ids:', nodeDataArray.map(n => n.node_id).slice(0, 20));
        }
        solverBlock = await buildSolverBlockFromNodeData(
          nodeDataArray, 
          snapshot.snapshotInput, 
          vectorResult.similarityScore,
          snapshot.snapshotInput.heroCards,
          nodeId
        );

        // Handle TURN fallback strategy
        if (solverBlock.optimalStrategy?.actionFrequencies?.length < 2) {
          // Use fallback metadata
          if (vectorResult.nodeMetadata.optimal_strategy) {
            try {
              solverBlock.optimalStrategy = JSON.parse(vectorResult.nodeMetadata.optimal_strategy);
            } catch (parseError) {
              console.warn('Failed to parse fallback strategy:', parseError.message);
            }
          }
          // Remove unreliable data for TURN nodes
          delete vectorResult.rangeAdvantage;
        }
      }
      
      return { ...snapshot, solver: solverBlock };
    } catch (error) {
      console.warn(`Failed to enrich ${street} snapshot:`, error.message);
      return { ...snapshot, solver: null };
    }
  }

  /**
   * Generate cache key for nodeMetadata
   * @param {Object} nodeMetadata - The node metadata
   * @returns {string} Cache key
   */
  getCacheKey(nodeMetadata) {
    return `${nodeMetadata.s3_bucket}:${nodeMetadata.s3_key}`;
  }

  /**
   * Enrich a RIVER snapshot using cached TURN data
   * @param {Object} riverSnapshot - The RIVER snapshot to enrich
   * @param {Array} turnResult - Turn Result
   * @param {Map} zstCache - Cache containing pre-downloaded nodeDataArrays
   * @returns {Promise<Object>} Enriched RIVER snapshot
   */
  async enrichRiverSnapshot(riverSnapshot, turnResult, zstCache = new Map()) {
    try {
      const { vectorResult } = turnResult;
      if (!vectorResult?.nodeMetadata) {
        console.warn('No vector result metadata for TURN snapshot');
        return { ...riverSnapshot, solver: null };
      }
      
      // Try to get cached TURN zst data first
      const cacheKey = this.getCacheKey(vectorResult.nodeMetadata);
      let nodeDataArray = zstCache.get(cacheKey);
      
      if (!nodeDataArray) {
        // Fallback: download if not cached (shouldn't happen normally)
        console.warn(`zst data not cached for RIVER processing, downloading: ${cacheKey}`);
        nodeDataArray = await this.solver.fetchAndDecodeNode(vectorResult.nodeMetadata);
        zstCache.set(cacheKey, nodeDataArray);
      } else {
        console.log(`Using cached zst data for RIVER processing: ${cacheKey}`);
      }
      
      // Local search: find best RIVER node in same zst
      const riverNode = this.findBestRiverNode(nodeDataArray, riverSnapshot.snapshotInput);
      
      if (!riverNode) {
        console.warn('No matching RIVER node found in TURN zst file');
        return { ...riverSnapshot, solver: null };
      }
      
      // Build solver block
      const solverBlock = await buildSolverBlockFromNodeData([riverNode], riverSnapshot.snapshotInput, vectorResult.similarityScore);
      return { ...riverSnapshot, solver: solverBlock };
      
    } catch (error) {
      console.warn('Failed to enrich RIVER snapshot:', error.message);
      return { ...riverSnapshot, solver: null };
    }
  }

  /**
   * Find the best RIVER node in a zst file using two-stage local search
   * @param {Array} nodeDataArray - Array of decoded nodes
   * @param {Object} snapshotInput - The RIVER snapshot input
   * @returns {Object|null} Best matching RIVER node
   */
  findBestRiverNode(nodeDataArray, snapshotInput) {
    // Stage 1: Filter by exact action sequence (like vector pipeline)
    const riverNodes = nodeDataArray.filter(node => 
      (node.street === 'RIVER' || node.street === 'River') &&
      this.compareActionSequences(node, snapshotInput)
    );
    
    if (riverNodes.length === 0) {
      console.warn('No RIVER nodes match action sequence');
      return null;
    }
    
    // Stage 2: Rank by cosine similarity on full 71-dimensional vectors
    let bestNode = null;
    let bestScore = -1;
    
    for (const node of riverNodes) {
      try {
        const similarity = this.calculateNodeSimilarity(node, snapshotInput);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestNode = node;
        }
      } catch (error) {
        console.warn('Error comparing RIVER node:', error.message);
        continue;
      }
    }
    
    console.log(`Selected RIVER node with similarity: ${bestScore} from ${riverNodes.length} candidates`);
    return bestNode;
  }

  /**
   * Compare action sequences for matching
   * @param {Object} node - The solver node
   * @param {Object} snapshotInput - The snapshot input
   * @returns {boolean} Whether sequences match
   */
  compareActionSequences(node, snapshotInput) {
    const nodeSequence = this.generateActionSequence(node.actionHistory || []);
    const snapshotSequence = this.generateActionSequence(snapshotInput.action_history || []);

    // console.log(`comparing original: ${nodeSequence}`)
    // console.log(`comparing inside: ${nodeSequence}`)
    
    // Exact match first
    if (nodeSequence === snapshotSequence) return true;
    
    return false;
  }

  /**
   * Get encoded action type
   */
  getActionTypeEncoded(action) {
    const actionLower = action.toLowerCase();
    
    for (const [key, value] of Object.entries(ACTION_ENCODING)) {
      if (actionLower.startsWith(key)) {
        return value;
      }
    }
    
    return 0; // Default to check
  }

  /**
   * Generate action sequence string (e.g., "X-B-R-C")
   */
  generateActionSequence(actions) {
    if (!actions || actions.length === 0) return '';
    
    const symbols = actions.map(action => {
      const actionType = this.getActionTypeEncoded(action);
      return ACTION_SYMBOLS[actionType] || 'U'; // U for unknown
    });
    
    return symbols.join('-');
  }

  /**
   * Calculate similarity between a node and snapshot using cosine similarity on feature vectors
   * @param {Object} node - The solver node
   * @param {Object} snapshotInput - The snapshot input
   * @returns {number} Similarity score (0-1)
   */
  calculateNodeSimilarity(node, snapshotInput) {
    try {
      // Generate vectors inline
      const nodeSnapshot = {
        street: node.street || 'RIVER',
        game_type: node.game_type || 'cash', 
        pot_type: node.pot_type || 'srp',
        positions: { oop: node.positions?.oop || 'bb', ip: node.positions?.ip || 'bu' },
        next_to_act: node.next_to_act || 'oop',
        stack_bb: node.stack_oop || node.stack_ip || 100,
        stack_bb_solve: 100,
        pot_bb: node.pot || 0,
        board: node.board || [],
        action_history: node.action_history || []
      };
      
      const nodeVector = this.solver.buildFeatureVector(nodeSnapshot);
      const snapshotVector = this.solver.buildFeatureVector(snapshotInput);
      
      // Cosine similarity calculation
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < nodeVector.length; i++) {
        dotProduct += nodeVector[i] * snapshotVector[i];
        normA += nodeVector[i] * nodeVector[i];
        normB += snapshotVector[i] * snapshotVector[i];
      }
      
      const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
      return magnitude === 0 ? 0 : dotProduct / magnitude;
      
    } catch (error) {
      console.warn('Vector similarity failed:', error.message);
      // Fallback to basic similarity
      const potSim = Math.max(0, 1 - Math.abs((node.pot || 0) - (snapshotInput.pot_bb || 0)) / 100);
      const stackSim = Math.max(0, 1 - Math.abs((node.stack_oop || node.stack_ip || 0) - (snapshotInput.stack_bb || 0)) / 100);
      return (potSim + stackSim) / 2;
    }
  }

  /**
   * Build comprehensive solver block from FLOP node using modular functions
   * @param {Object} flopNode - The flop node from MongoDB
   * @param {string} heroHand - Optional hero hand (e.g., "AhKh")
   * @param {number} similarityScore - Similarity score (default: 1.0)
   * @returns {Promise<Object>} Complete SolverBlock object
   */
  async buildSolverBlockFromFlopNode(flopNode, heroHand = null, similarityScore = 1.0) {
    if (!flopNode) return null;
    
    try {
      const board = flopNode.board || [];
      const oopRange = flopNode.rangeStats?.oop || 'AA:1.0';
      const ipRange = flopNode.rangeStats?.ip || 'AA:1.0';
      const nextToAct = flopNode.nextToAct || 'oop';
      
      // Base solver block structure
      const solverBlock = {
        nodeId: flopNode._id,
        street: flopNode.street,
        board: board,
        pot: flopNode.pot,
        stacks: {
          oop: flopNode.stackOOP,
          ip: flopNode.stackIP
        },
        positions: flopNode.positions || { oop: 'bb', ip: 'bu' },
        nextToAct: nextToAct,
        sim: similarityScore
      };
      
      // Board Analysis using modular functions
      try {
        solverBlock.boardAnalysis = this.solver.analyzeBoardTexture(board);
      } catch (error) {
        console.warn('Board analysis failed:', error.message);
        solverBlock.boardAnalysis = { texture: 'Unknown', isPaired: false, textureTags: [] };
      }
      
      // Range Equity Analysis
      try {
        solverBlock.rangeAdvantage = this.solver.calculateRangeEquity(
          oopRange,
          ipRange,
          board,
          nextToAct
        );
      } catch (error) {
        console.warn('Range equity analysis failed:', error.message);
        solverBlock.rangeAdvantage = {
          heroEquity: 50, villainEquity: 50, equityDelta: 0,
          heroValuePct: 0, villainValuePct: 0, valueDelta: 0
        };
      }
      
      // Optimal Strategy from FLOP node data
      const actions = nextToAct === 'oop' ? flopNode.actionsOOP : flopNode.actionsIP;
      if (actions && actions.length > 0) {
        const recommendedAction = actions.reduce((best, current) => 
          current.frequency > best.frequency ? current : best
        );
        
        solverBlock.optimalStrategy = {
          recommendedAction: {
            action: recommendedAction.action,
            ev: recommendedAction.ev || 0,
            frequency: recommendedAction.frequency
          },
          actionFrequencies: actions.map(action => ({
            action: action.action,
            frequency: action.frequency,
            ev: action.ev || 0
          }))
        };
      } else {
        solverBlock.optimalStrategy = {
          recommendedAction: { action: 'Check', ev: 0, frequency: 1.0 },
          actionFrequencies: []
        };
      }
      
      // Hero hand analysis (if provided)
      if (heroHand) {
        try {
          // Determine villain range based on position
          const villainRange = nextToAct === 'oop' ? ipRange : oopRange;
          
          // Blocker Impact Analysis
          solverBlock.blockerImpact = this.solver.calculateBlockerImpact(
            heroHand,
            villainRange,
            board
          );
          
          // Hand Features Analysis
          solverBlock.handFeatures = this.solver.analyzeHandFeatures(
            heroHand,
            board,
            villainRange
          );
          
          // Complete Range Analysis
          const rangeAnalysis = this.solver.analyzeRangeComplete(
            heroHand,
            villainRange,
            board,
            nextToAct === 'oop' ? oopRange : ipRange
          );
          
          solverBlock.heroRange = rangeAnalysis.heroRange;
          solverBlock.villainRange = rangeAnalysis.villainRange;
          
        } catch (error) {
          console.warn('Hero hand analysis failed:', error.message);
          solverBlock.blockerImpact = {
            combosBlockedPct: 0, valueBlockedPct: 0, bluffsUnblockedPct: 0,
            cardRemoval: [], topBlocked: []
          };
          solverBlock.handFeatures = {
            madeTier: 'Unknown', drawFlags: [], equityVsRange: 50
          };
        }
      }
      
      return solverBlock;
      
    } catch (error) {
      console.error('Error building solver block from FLOP node:', error);
      throw new Error(`Failed to build solver block: ${error.message}`);
    }
  }

  // /**
  //  * Build solver block from node data using the same logic as solverNodeService
  //  * @param {Array} nodeDataArray - Array of decoded node analyses
  //  * @param {Object} snapshotInput - The snapshot input object
  //  * @param {number} similarityScore - Similarity score
  //  * @returns {Promise<Object>} SolverBlock object
  //  */
  // async buildSolverBlockFromNodeData(nodeDataArray, snapshotInput, similarityScore = 1.0, heroHand = false, ) {
  //   try {
  //     // Use the existing buildSolverBlockFromNodeData from solverNodeService
  //     const { buildSolverBlockFromNodeData } = require('../../utils/solverNodeService');
  //     return await buildSolverBlockFromNodeData(
  //       nodeDataArray,
  //       snapshotInput,
  //       similarityScore,
  //       snapshotInput.heroCards
  //     );
  //   } catch (error) {
  //     console.error('Error building solver block from node data:', error);
  //     throw new Error(`Failed to build solver block: ${error.message}`);
  //   }
  // }
}

module.exports = new Solves();