const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { calculateRangeEquity } = require('../../utils/solver-node');

// Import additional dependencies for the new functionality
const Hands = require('./Hands');
const ModularSolverNodeService = require('../../utils/ModularSolverNodeService');
const { buildSolverBlockFromNodeData } = require('../../utils/solverNodeService');
const { generateSnapshots } = require('../../utils/solver-snapshot-generator');
const { findSimilarNode } = require('../../utils/vectorSearch');

// Import bet sizing parser
const { parseActionArray } = require('../../utils/betSizingParser');

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
    const totalStartTime = Date.now();
    console.log(`🚀 [TIMING] Starting prepareSnapshots for hand ${handId}`);
    
    try {
      // 1. Get hand data
      const handStartTime = Date.now();
      const hand = await Hands.findById(+handId);
      console.log(`📖 [TIMING] Hand lookup: ${Date.now() - handStartTime}ms`);
      
      if (!hand) {
        throw new Error(`Hand not found: ${handId}`);
      }
      
      // 2. Generate snapshots using existing generator
      const snapshotGenStartTime = Date.now();
      const snapshots = generateSnapshots(hand);
      console.log(`📸 [TIMING] Snapshot generation (${snapshots.length} snapshots): ${Date.now() - snapshotGenStartTime}ms`);
      
      // 3. Separate by street
      const flopSnapshots = snapshots.filter(s => s.snapshotInput.street === 'FLOP');
      const turnSnapshots = snapshots.filter(s => s.snapshotInput.street === 'TURN');
      const riverSnapshots = snapshots.filter(s => s.snapshotInput.street === 'RIVER');
      console.log(`📊 [TIMING] Snapshot breakdown - FLOP: ${flopSnapshots.length}, TURN: ${turnSnapshots.length}, RIVER: ${riverSnapshots.length}`);
      
      // 4. Vector search (exclude RIVER) - batch for better performance
      const vectorSearchStartTime = Date.now();
      const vectorTargets = [...flopSnapshots, ...turnSnapshots];

      console.log(snapshots);
      
      // Try batched search first, fall back to individual if not available
      let vectorResults;
      try {
        const { batchFindSimilarNodes } = require('../../utils/vectorSearch');
        vectorResults = await batchFindSimilarNodes(
          vectorTargets.map(s => s.snapshotInput),
          { batchSize: 5 } // Process 5 at a time to avoid overwhelming Qdrant
        );
        console.log(`🔍 [TIMING] Batched vector search for ${vectorTargets.length} snapshots: ${Date.now() - vectorSearchStartTime}ms`);
      } catch (error) {
        console.warn('Batched search failed, falling back to individual queries:', error.message);
        vectorResults = await Promise.all(
          vectorTargets.map(snapshot => findSimilarNode(snapshot.snapshotInput))
        );
        console.log(`🔍 [TIMING] Individual vector search for ${vectorTargets.length} snapshots: ${Date.now() - vectorSearchStartTime}ms`);
      }
      
      // 5. Enrich each snapshot with zst caching
      const enrichmentStartTime = Date.now();
      const enrichedSnapshots = [];
      const zstCache = new Map(); // Cache for nodeDataArray by vectorResult metadata
      
      // Process FLOP + TURN in parallel and collect TURN vector results
      const turnVectorResults = [];
      const enrichmentPromises = vectorTargets.map(async (snapshot, i) => {
        console.log(vectorResults[i]);
        const vectorResult = vectorResults[i];
        const enriched = await this.enrichSnapshot(snapshot, vectorResult, zstCache);
        
        // Collect TURN vector results for RIVER reuse
        if (snapshot.snapshotInput.street === 'TURN') {
          turnVectorResults.push({ snapshot, vectorResult });
        }
        
        return enriched;
      });
      
      const parallelEnrichedSnapshots = await Promise.all(enrichmentPromises);
      enrichedSnapshots.push(...parallelEnrichedSnapshots);
      console.log(`⚡ [TIMING] Parallel enrichment of ${vectorTargets.length} snapshots: ${Date.now() - enrichmentStartTime}ms`);
      
      // 6. Process RIVER (reuse TURN vector results and cached zst data)
      const riverStartTime = Date.now();
      for (const riverSnapshot of riverSnapshots) {
        const turnResult = turnVectorResults[turnVectorResults.length - 1]
        const enriched = await this.enrichRiverSnapshot(riverSnapshot, turnResult, zstCache);
        enrichedSnapshots.push(enriched);
      }
      console.log(`🌊 [TIMING] RIVER processing (${riverSnapshots.length} snapshots): ${Date.now() - riverStartTime}ms`);
      
      const totalTime = Date.now() - totalStartTime;
      console.log(`✅ [TIMING] Total prepareSnapshots completed: ${totalTime}ms`);
      
      return enrichedSnapshots;
      
    } catch (error) {
      const totalTime = Date.now() - totalStartTime;
      console.error(`❌ [TIMING] Error preparing snapshots after ${totalTime}ms:`, error);
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
    const enrichStartTime = Date.now();
    const street = snapshot.snapshotInput.street;
    console.log(`🔍 [TIMING] Starting ${street} enrichment for snapshot`);
    console.log({vectorResult});
    
    if (!vectorResult?.nodeMetadata) {
      console.log(`⚠️  [TIMING] ${street} enrichment skipped - no vector result (${Date.now() - enrichStartTime}ms)`);
      return { ...snapshot, solver: null };
    }
    
    let solverBlock;
    
    try {
      if (street === 'FLOP') {
        // Get from MongoDB
        const dbStartTime = Date.now();
        const flopNode = await this.findFlopNodeById(vectorResult.nodeMetadata.original_id);
        console.log(`📊 [TIMING] FLOP MongoDB lookup: ${Date.now() - dbStartTime}ms`);
        
        if (!flopNode) {
          console.warn(`FLOP node not found: ${vectorResult.nodeMetadata._id || vectorResult.nodeMetadata.original_id}`);
          return { ...snapshot, solver: null };
        }
        
        const buildStartTime = Date.now();
        solverBlock = await this.buildSolverBlockFromFlopNode(flopNode, snapshot.snapshotInput.heroCards, vectorResult.similarityScore, snapshot.snapshotInput.board);
        console.log(`🔨 [TIMING] FLOP solver block build: ${Date.now() - buildStartTime}ms`);
        
      } else {
        // TURN: unpack zst and cache for RIVER reuse
        const cacheKey = this.getCacheKey(vectorResult.nodeMetadata);
        let nodeDataArray = zstCache.get(cacheKey);
        
        if (!nodeDataArray) {
          const s3StartTime = Date.now();
          nodeDataArray = await this.solver.fetchAndDecodeNode(vectorResult.nodeMetadata);
          console.log(`📥 [TIMING] TURN S3 fetch + decode: ${Date.now() - s3StartTime}ms`);
          
          zstCache.set(cacheKey, nodeDataArray);
          console.log(`Cached zst data for key: ${cacheKey}`);
        } else {
          console.log(`✅ [TIMING] Using cached zst data for key: ${cacheKey} (0ms)`);
        }
        
        // Pass the node_identifier from vector result for direct lookup
        const nodeSearchStartTime = Date.now();
        const nodeId = vectorResult.nodeMetadata?.node_identifier || vectorResult.nodeMetadata?._id;
        console.log(`Using nodeId for TURN lookup: ${nodeId}`);
        
        // Search for the exact nodeId in the entire array
        const targetNodeFound = nodeDataArray.find(n => n.node_id === nodeId);
        console.log(`🔍 [TIMING] TURN node search in array (${nodeDataArray.length} nodes): ${Date.now() - nodeSearchStartTime}ms`);
        
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
        
        const buildStartTime = Date.now();
        solverBlock = await buildSolverBlockFromNodeData(
          nodeDataArray, 
          snapshot.snapshotInput, 
          vectorResult.similarityScore,
          snapshot.snapshotInput.heroCards,
          nodeId
        );
        console.log(`🔨 [TIMING] TURN solver block build: ${Date.now() - buildStartTime}ms`);

        // Handle TURN fallback strategy
        const fallbackStartTime = Date.now();
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
        console.log(`⚙️  [TIMING] TURN fallback processing: ${Date.now() - fallbackStartTime}ms`);
      }
      
      // Generate tags if solver block exists
      let solverTags = null;
      if (solverBlock) {
        const tagStartTime = Date.now();
        try {
          const TagGenerationService = require('../../utils/TagGenerationService');
          const tagService = new TagGenerationService({
            enableReasoning: true,
            tagPriority: 'balanced'
          });
          
          solverTags = tagService.generateTags(solverBlock, {
            street: snapshot.snapshotInput.street,
            potBB: snapshot.snapshotInput.pot_bb || snapshot.snapshotInput.pot,
            effectiveStackBB: snapshot.snapshotInput.stack_bb || snapshot.snapshotInput.heroStackBB,
            heroAction: snapshot.heroAction,
            streetHistory: snapshot.streetActionsHistory,
            potOdds: snapshot.snapshotInput.potOdds,
          });
          
          console.log(`🏷️  [TIMING] Tag generation (${solverTags.length} tags): ${Date.now() - tagStartTime}ms`);
        } catch (tagError) {
          console.warn('Failed to generate tags:', tagError.message);
          solverTags = null;
        }
      }
      
      const totalTime = Date.now() - enrichStartTime;
      console.log(`✅ [TIMING] Total ${street} enrichment completed: ${totalTime}ms`);
      
      return { ...snapshot, solver: solverBlock, solverTags };
    } catch (error) {
      const totalTime = Date.now() - enrichStartTime;
      console.warn(`❌ [TIMING] Failed to enrich ${street} snapshot after ${totalTime}ms:`, error.message);
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
      
      // Generate tags if solver block exists
      let solverTags = null;
      if (solverBlock) {
        try {
          const TagGenerationService = require('../../utils/TagGenerationService');
          const tagService = new TagGenerationService({
            enableReasoning: true,
            tagPriority: 'balanced'
          });
          
          solverTags = tagService.generateTags(solverBlock, {
            street: riverSnapshot.snapshotInput.street,
            potBB: riverSnapshot.snapshotInput.pot_bb || riverSnapshot.snapshotInput.pot,
            effectiveStackBB: riverSnapshot.snapshotInput.stack_bb || riverSnapshot.snapshotInput.heroStackBB,
            heroAction: riverSnapshot.heroAction,
            streetHistory: riverSnapshot.streetActionsHistory,
            potOdds: riverSnapshot.snapshotInput.potOdds,
          });
        } catch (tagError) {
          console.warn('Failed to generate tags for RIVER:', tagError.message);
        }
      }
      
      return { ...riverSnapshot, solver: solverBlock, solverTags };
      
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
  async buildSolverBlockFromFlopNode(flopNode, heroHand = null, similarityScore = 1.0, actualBoard = []) {
    if (!flopNode) return null;
    
    try {
      const board = actualBoard || [];
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
        // Parse actions to include bet sizing information
        // For flop nodes, solver pot = actual pot (both in BB)
        const solverPotBB = flopNode.pot;
        const actualPotBB = flopNode.pot; // Same for flop nodes
        const bbSize = 2; // Default BB size in chips
        
        // Parse all actions to include sizing
        const parsedActions = parseActionArray(actions, solverPotBB, actualPotBB, bbSize);
        
        const recommendedAction = parsedActions.reduce((best, current) => 
          current.frequency > best.frequency ? current : best
        );
        
        solverBlock.optimalStrategy = {
          recommendedAction: {
            action: recommendedAction.action,
            ev: recommendedAction.ev || 0,
            frequency: recommendedAction.frequency,
            actionType: recommendedAction.actionType,
            sizing: recommendedAction.sizing
          },
          actionFrequencies: parsedActions.map(action => ({
            action: action.action,
            frequency: action.frequency,
            ev: action.ev || 0,
            actionType: action.actionType,
            sizing: action.sizing
          }))
        };
      } else {
        solverBlock.optimalStrategy = {
          recommendedAction: { action: 'Check', ev: 0, frequency: 1.0, actionType: 'check', sizing: null },
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
            nextToAct === 'oop' ? oopRange : ipRange,
            flopNode.comboData ? JSON.stringify(flopNode.comboData) : null
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

      // Add combo-specific strategy (NEW: extract strategy for hero's hand category)
      if (heroHand && flopNode.comboData) {
        try {
          // Get range string for the acting player
          const actingRange = nextToAct === 'oop' ? oopRange : ipRange;
          
          // Extract combo strategy using the new modular function with two-board approach
          const comboStrategy = this.solver.extractComboStrategy(
            heroHand,
            board,                    // actual_board where hero's hand is being analyzed
            flopNode.board || board,  // solver_board where strategies were calculated
            actingRange,
            flopNode.comboData
          );
          
          solverBlock.comboStrategy = comboStrategy;
          
        } catch (error) {
          console.warn('Combo strategy extraction failed:', error.message);
          solverBlock.comboStrategy = {
            heroHand,
            category: "Unknown",
            madeTier: "Unknown",
            drawFlags: [],
            topActions: [
              { action: "Check", frequency: 100.0, ev: 0.0 }
            ],
            recommendedAction: "Check",
            confidence: "low"
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