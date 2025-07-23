const s3Helper = require('./s3');

// Import the new modular solver service
const ModularSolverNodeService = require('./ModularSolverNodeService');

// Import buildFeatureVector to generate query vector
const { buildFeatureVector } = require('./vectorSearch');

// Import Solves collection for flop nodes
const Solves = require('../db/collections/Solves');

// Import bet sizing parser
const { parseActionArray } = require('./betSizingParser');

// Initialize the modular service with metrics enabled
const modularService = new ModularSolverNodeService({
    enableMetrics: true,
    defaultBucket: process.env.SOLVER_S3_BUCKET || 'solver-nodes'
});

/**
 * Solver Node Service Module
 * Implements Phase 3.2 and 3.3 of the solver integration checklist
 * 
 * This module handles:
 * - Fetching compressed solver nodes from S3
 * - Decompressing Zstandard frames
 * - Decoding Bincode data to JSON using Rust napi bindings
 * - Transforming NodeAnalysis to frontend-friendly SolverBlock format using Rust
 */

/**
 * Decode Bincode-encoded data to JSON using modular service
 * 
 * @param {Buffer} buffer - Bincode encoded data
 * @param {boolean} isCompressed - Whether the buffer is zstd-compressed
 * @returns {Object} Decoded NodeAnalysis objects (array for compressed files)
 */
function decodeBincode(buffer, isCompressed = false) {
  try {
    if (isCompressed) {
      // Use modular service for decompression and decoding
      return modularService.decodeCompressedNode(buffer);
    } else {
      // Use modular service for just bincode decoding
      return modularService.decodeNode(buffer);
    }
  } catch (error) {
    throw new Error(`Failed to decode Bincode data: ${error.message}`);
  }
}

/**
 * Fetch and unpack a solver node from S3 using modular service
 * @param {Object} leanNodeMeta - The LeanNodeMeta object containing S3 location
 * @returns {Promise<Array<Object>>} Array of unpacked NodeAnalysis objects
 */
async function getUnpackedNode(leanNodeMeta) {
  try {
    // Use modular service for complete fetch and decode operation
    return await modularService.fetchAndDecodeNode(leanNodeMeta);
  } catch (error) {
    console.error('Error fetching/unpacking node:', error);
    throw new Error(`Failed to get unpacked node: ${error.message}`);
  }
}

// Note: Action transformation and combo data extraction are now handled 
// internally by the Rust napi bindings for optimal performance

/**
 * Build SolverBlock from NodeAnalysis using modular functions
 * @param {Array<Object>} nodeAnalyses - Array of NodeAnalysis objects from decode
 * @param {Object} snapshotInput - The snapshot input object
 * @param {number} similarityScore - Similarity score from vector search
 * @param {string} heroHand - Optional hero hand (e.g., "AhKh")
 * @param {string} nodeId - Optional specific node ID to find
 * @returns {Promise<Object>} SolverBlock built using modular functions
 */
async function buildSolverBlockFromNodeData(nodeAnalyses, snapshotInput, similarityScore = 1.0, heroHand = null, nodeId = null) {
  const buildStartTime = Date.now();
  console.log(`🔨 [TIMING] Starting buildSolverBlockFromNodeData`);
  
  try {
    // Find the target node
    const nodeSearchStartTime = Date.now();
    let targetNode;
    if (nodeId && Array.isArray(nodeAnalyses)) {
      // Direct lookup by node_identifier for TURN nodes
      targetNode = nodeAnalyses.find(node => node.node_id === nodeId || node.node_identifier === nodeId);
      if (!targetNode) {
        throw new Error(`Node with identifier '${nodeId}' not found in file`);
      }
      console.log('Found TURN node by direct lookup:', nodeId);
    } else if (Array.isArray(nodeAnalyses)) {
      // For RIVER nodes or when no specific node ID, use first node or implement selection logic
      targetNode = nodeAnalyses[0];
      console.log(`Using first node from ${nodeAnalyses.length} available nodes`);
    } else {
      targetNode = nodeAnalyses;
    }
    console.log(`🔍 [TIMING] Node search/selection: ${Date.now() - nodeSearchStartTime}ms`);

    if (!targetNode) {
      throw new Error('No target node found for SolverBlock building');
    }

    // Extract basic node information
    const solverBlock = {
      nodeId: targetNode.node_id || 'unknown',
      street: snapshotInput.street,
      board: snapshotInput.board,
      pot: snapshotInput.pot_bb,
      stacks: {
        oop: snapshotInput.stack_bb,
        ip: snapshotInput.stack_bb
      },
      positions: snapshotInput.positions || { oop: 'bb', ip: 'bu' },
      nextToAct: targetNode.next_to_act === 'IP' ? 'ip' : 'oop',
      sim: similarityScore
    };

    // Build components using modular functions
    const board = snapshotInput.board;
    
    try {
      // Board Analysis
      const boardAnalysisStartTime = Date.now();
      solverBlock.boardAnalysis = modularService.analyzeBoardTexture(board);
      console.log(`🏔️  [TIMING] Board analysis: ${Date.now() - boardAnalysisStartTime}ms`);
    } catch (error) {
      console.warn('Board analysis failed:', error.message);
      solverBlock.boardAnalysis = { texture: 'Unknown', isPaired: false, textureTags: [] };
    }

    // console.log({ targetNode })

    // Extract ranges from node data
    const oopRange = targetNode.rangeStats.oop || `${heroHand}@100`;
    const ipRange = targetNode.rangeStats.ip || '';
    
    try {
      // Range Equity Analysis
      const rangeEquityStartTime = Date.now();
      solverBlock.rangeAdvantage = modularService.calculateRangeEquity(
        oopRange,
        ipRange,
        board,
        solverBlock.nextToAct
      );
      console.log(`⚖️  [TIMING] Range equity analysis: ${Date.now() - rangeEquityStartTime}ms`);
    } catch (error) {
      console.warn('Range equity analysis failed:', error.message);
      solverBlock.rangeAdvantage = {
        heroEquity: 50, villainEquity: 50, equityDelta: 0,
        heroValuePct: 0, villainValuePct: 0, valueDelta: 0
      };
    }

    // Hero hand analysis (if provided)
    if (heroHand) {
      try {
        // Determine villain range based on position
        const villainRange = solverBlock.nextToAct === 'oop' ? ipRange : oopRange;

        
        // Blocker Impact Analysis
        solverBlock.blockerImpact = modularService.calculateBlockerImpact(
          heroHand,
          villainRange,
          board
        );

        // Hand Features Analysis
        solverBlock.handFeatures = modularService.analyzeHandFeatures(
          heroHand,
          board,
          villainRange
        );

        // Complete Range Analysis
        const rangeAnalysisStartTime = Date.now();
        const rangeAnalysis = modularService.analyzeRangeComplete(
          heroHand,
          villainRange,
          board,
          solverBlock.nextToAct === 'oop' ? oopRange : ipRange,
          targetNode.comboData ? JSON.stringify(targetNode.comboData) : null
        );
        console.log(`📊 [TIMING] Complete range analysis: ${Date.now() - rangeAnalysisStartTime}ms`);
        
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

    // Optimal Strategy from node data
    try {
      const actions = targetNode.actionsOOP || targetNode.actionsIP || [];
      if (actions.length > 0) {
        // Parse actions to include bet sizing information
        // Get solver pot and actual pot for sizing calculations
        const solverPotBB = targetNode.pot || snapshotInput.pot_bb;
        const actualPotBB = snapshotInput.pot_bb;
        const bbSize = snapshotInput.bb_size || 2;
        
        // Parse all actions to include sizing
        const parsedActions = parseActionArray(actions, solverPotBB, actualPotBB, bbSize);
        
        // Find recommended action (highest frequency)
        const recommendedAction = parsedActions.reduce((best, current) => 
          current.frequency > best.frequency ? current : best
        );
        
        solverBlock.optimalStrategy = {
          recommendedAction: {
            action: recommendedAction.action,
            ev: recommendedAction.ev,
            frequency: recommendedAction.frequency,
            actionType: recommendedAction.actionType,
            sizing: recommendedAction.sizing
          },
          actionFrequencies: parsedActions.map(action => ({
            action: action.action,
            frequency: action.frequency,
            ev: action.ev,
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
    } catch (error) {
      console.warn('Strategy analysis failed:', error.message);
      solverBlock.optimalStrategy = {
        recommendedAction: { action: 'Check', ev: 0, frequency: 1.0, actionType: 'check', sizing: null },
        actionFrequencies: []
      };
    }

    // Add combo-specific strategy (NEW: extract strategy for hero's hand category)
    if (heroHand && targetNode.comboData) {
      try {
        // Get range string for the acting player and villain
        const actingRange = solverBlock.nextToAct === 'oop' ? oopRange : ipRange;
        const villainRange = solverBlock.nextToAct === 'oop' ? ipRange : oopRange;
        
        // Extract combo strategy using the new modular function with two-board approach
        const comboStrategy = modularService.extractComboStrategy(
          heroHand,
          board,      // actual_board where hero's hand is being analyzed
          targetNode.board,      // solver_board where strategies were calculated (same for now)
          actingRange,
          targetNode.comboData
        );
        
        // Parse bet sizing for combo strategy actions
        if (comboStrategy.topActions && comboStrategy.topActions.length > 0) {
          const solverPotBB = targetNode.pot || snapshotInput.pot_bb;
          const actualPotBB = snapshotInput.pot_bb;
          const bbSize = snapshotInput.bb_size || 2;
          
          comboStrategy.topActions = parseActionArray(
            comboStrategy.topActions,
            solverPotBB,
            actualPotBB,
            bbSize
          );
        }
        
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

    const totalBuildTime = Date.now() - buildStartTime;
    console.log(`✅ [TIMING] Total buildSolverBlockFromNodeData completed: ${totalBuildTime}ms`);
    
    return solverBlock;
    
  } catch (error) {
    const totalBuildTime = Date.now() - buildStartTime;
    console.error(`❌ [TIMING] Error building SolverBlock after ${totalBuildTime}ms:`, error);
    throw new Error(`Failed to build SolverBlock: ${error.message}`);
  }
}

/**
 * Fetch, unpack, and transform a solver node using modular approach
 * @param {Object} leanNodeMeta - The LeanNodeMeta object containing S3 location
 * @param {Object} snapshotInput - The snapshot input object
 * @param {number} similarityScore - Similarity score from vector search
 * @param {string} heroHand - Optional hero hand (e.g., "AhKh")
 * @returns {Promise<Object>} SolverBlock built using modular functions
 */
async function getUnpackedAndTransformedNode(leanNodeMeta, snapshotInput, similarityScore = 1.0, heroHand = null) {
  
  try {
    // Fetch and decode the node data using modular service
    const nodeAnalyses = await modularService.fetchAndDecodeNode(leanNodeMeta);
    
    // For TURN nodes, save compressed data for debugging
    if (snapshotInput.street === 'TURN') {
      try {
        const compressedData = await modularService.fetchCompressedNodeData(leanNodeMeta);
        const fs = require('fs');
        fs.writeFileSync(`compressedData_${snapshotInput.street}.zstd`, compressedData);
      } catch (debugError) {
        console.warn('Failed to save debug file:', debugError.message);
      }
    }

    // Extract hero hand from snapshot if available
    const heroHandFromSnapshot = snapshotInput.heroCards && typeof snapshotInput.heroCards === 'string' ? 
      snapshotInput.heroCards : heroHand;

    // Get node ID for direct lookup (for TURN nodes)
    const nodeId = snapshotInput.node_identifier;
    
    // Build SolverBlock using modular functions
    const result = await buildSolverBlockFromNodeData(
      nodeAnalyses,
      snapshotInput,
      similarityScore,
      heroHandFromSnapshot,
      nodeId
    );

    // Handle TURN fallback strategy
    if (snapshotInput.street === 'TURN' && !result.optimalStrategy?.actionFrequencies?.length) {
      // Use fallback metadata
      if (leanNodeMeta.optimal_strategy) {
        try {
          result.optimalStrategy = JSON.parse(leanNodeMeta.optimal_strategy);
        } catch (parseError) {
          console.warn('Failed to parse fallback strategy:', parseError.message);
        }
      }
      // Remove unreliable data for TURN nodes
      delete result.rangeAdvantage;
    }

    return result;

  } catch (error) {
    console.error('Error in modular unpack and transform:', error);
    throw new Error(`Failed to get unpacked and transformed node: ${error.message}`);
  }
}

/**
 * Transform NodeAnalysis to SolverBlock format using modular functions
 * @param {Object|Array<Object>} nodeAnalysis - NodeAnalysis object(s) from decode
 * @param {Object} snapshot - The snapshot input object
 * @param {number} similarityScore - Similarity score from vector search
 * @param {string} heroHand - Optional hero hand (e.g., "AhKh")
 * @returns {Promise<Object>} SolverBlock formatted for frontend
 */
async function transformNodeToSolverBlock(nodeAnalysis, snapshot, similarityScore = 1.0, heroHand = null) {
  if (!nodeAnalysis) {
    throw new Error('Invalid NodeAnalysis: null or undefined');
  }

  try {
    // Use modular approach to build SolverBlock
    return await buildSolverBlockFromNodeData(
      nodeAnalysis,
      snapshot,
      similarityScore,
      heroHand
    );
  } catch (error) {
    console.error('Error transforming node with modular functions:', error);
    
    // Fallback to basic transformation if modular approach fails
    const nodeId = Array.isArray(nodeAnalysis) ? 
      (nodeAnalysis[0]?.node_id || 'unknown') : 
      (nodeAnalysis.node_id || 'unknown');
      
    return {
      nodeId,
      sim: similarityScore,
      boardAnalysis: {
        texture: 'Unknown',
        isPaired: false,
        textureTags: []
      },
      rangeAdvantage: {
        heroEquity: 50,
        villainEquity: 50,
        equityDelta: 0,
        heroValuePct: 0,
        villainValuePct: 0,
        valueDelta: 0
      },
      heroRange: {
        totalCombos: 0,
        categories: []
      },
      villainRange: {
        totalCombos: 0,
        categories: []
      },
      blockerImpact: {
        combosBlockedPct: 0,
        valueBlockedPct: 0,
        bluffsUnblockedPct: 0,
        cardRemoval: [],
        topBlocked: []
      },
      optimalStrategy: {
        recommendedAction: {
          action: 'Check',
          ev: 0,
          frequency: 1.0
        },
        actionFrequencies: []
      },
      error: error.message
    };
  }
}

/**
 * Process a snapshot with vector search result
 * Fetches the node from MongoDB (for flop) or S3 (for turn/river) and transforms it to frontend format
 * @param {Object} snapshot - Snapshot with vector search result
 * @returns {Promise<Object>} Enriched snapshot with solver data
 */
async function processSnapshotWithSolverData(snapshot) {
  const { snapshotInput, vectorSearchResult } = snapshot;

  if (!vectorSearchResult || !vectorSearchResult.nodeMetadata) {
    // No solver data available
    return {
      ...snapshot,
      solver: null,
      approxMultiWay: true
    };
  }

  try {
    const street = snapshotInput.street?.toUpperCase();
    let solverBlock;

    if (street === 'FLOP') {
      // For FLOP nodes, fetch from MongoDB using the original_id from vector search
      const nodeId = vectorSearchResult.nodeMetadata.original_id || 
                     vectorSearchResult.nodeMetadata._id;
      
      if (!nodeId) {
        throw new Error('No node ID found in vector search result for flop node');
      }

      const flopNode = await Solves.findFlopNodeById(nodeId);
      
      if (!flopNode) {
        throw new Error(`Flop node not found in MongoDB: ${nodeId}`);
      }

      // Transform the flop node to solver block format (now async)
      solverBlock = await Solves.transformFlopNode(flopNode);
      
      // Add similarity score and approximation flag
      solverBlock.sim = vectorSearchResult.similarityScore || 1.0;

      console.log({ vectorSearchResult });
      
    } else if (street === 'TURN' || street === 'RIVER') {
      // For TURN/RIVER nodes, use the S3/zst flow
      const heroHand = snapshotInput.heroCards ? 
        `${snapshotInput.heroCards[0]}${snapshotInput.heroCards[1]}` : null;

      // For TURN nodes, add the node_identifier to enable direct lookup in Rust
      // Note: Rust expects snake_case field names
      if (street === 'TURN' && vectorSearchResult.nodeMetadata.node_identifier) {
        snapshotInput.node_identifier = vectorSearchResult.nodeMetadata.node_identifier;
        console.log('Using node_identifier for TURN node direct lookup:', snapshotInput.node_identifier);
      }

      // Use the most efficient approach: fetch, decompress, decode, and transform in Rust
      solverBlock = await getUnpackedAndTransformedNode(
        vectorSearchResult.nodeMetadata,
        snapshotInput,
        vectorSearchResult.similarityScore || 1.0,
        heroHand
      );
    } else {
      throw new Error(`Unsupported street: ${street}`);
    }

    return {
      ...snapshot,
      solver: solverBlock,
      approxMultiWay: vectorSearchResult.isApproximation || false,
      similarityScore: vectorSearchResult.similarityScore,
      matchType: vectorSearchResult.nodeMetadata.matchType || 'exact',
      parentDepth: vectorSearchResult.nodeMetadata.parentDepth
    };

  } catch (error) {
    console.error('Error processing snapshot with solver data:', error);
    
    // Return snapshot without solver data on error
    return {
      ...snapshot,
      solver: null,
      approxMultiWay: true,
      error: error.message
    };
  }
}

/**
 * Batch process multiple snapshots
 * @param {Object[]} snapshots - Array of snapshots with vector search results
 * @returns {Promise<Object[]>} Array of enriched snapshots
 */
async function batchProcessSnapshots(snapshots) {
  try {
    // Process with controlled concurrency
    const batchSize = 3;
    const results = [];
    
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(snapshot => processSnapshotWithSolverData(snapshot))
      );
      results.push(...batchResults);
    }
    
    return results;
  } catch (error) {
    console.error('Error in batchProcessSnapshots:', error);
    throw error;
  }
}

module.exports = {
  getUnpackedNode,
  getUnpackedAndTransformedNode,
  transformNodeToSolverBlock,
  buildSolverBlockFromNodeData,
  processSnapshotWithSolverData,
  batchProcessSnapshots,
  // Export modular service for direct access if needed
  modularService
};