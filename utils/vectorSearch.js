const { QdrantClient } = require('@qdrant/js-client-rest');

// Import solver-node napi bindings
const { 
  buildFeatureVector: buildFeatureVectorRust,
  extractBoardTextureJs,
  canonicalizeActionHistory: canonicalizeActionHistoryRust,
  calculateActionHash,
  generateActionSequence
} = require('./solver-node');

// Import position bucket utilities
const { buildPositionBucketFilters, getPositionBucket } = require('./position-buckets');

// Qdrant client (singleton)
let qdrantClient = null;

/**
 * Vector Search Module for Solver Node Lookup
 * Implements Phase 3.1 of the solver integration checklist
 * 
 * This module handles:
 * - Building feature vectors from SnapshotInput objects using Rust napi bindings
 * - Querying Pinecone vector database for similar nodes
 * - Returning matched LeanNodeMeta documents
 */

/**
 * Initialize Qdrant client (lazy initialization)
 */
async function initializeQdrant() {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      host: process.env.QDRANT_HOST || 'localhost',
      port: parseInt(process.env.QDRANT_PORT) || 6333,
    });
    
    console.log(`✅ Initialized Qdrant client at ${process.env.QDRANT_HOST || 'localhost'}:${process.env.QDRANT_PORT || 6333}`);
  }
  
  return qdrantClient;
}

// Note: Position mappings, street encodings, and other constants are now handled 
// internally by the Rust napi bindings for optimal performance and consistency

/**
 * Determine which Qdrant collection to use based on street
 * @param {string} street - The street (FLOP, TURN, RIVER)
 * @returns {string} Collection name
 */
function getCollectionName(street) {
  const streetUpper = street ? street.toUpperCase() : '';
  
  switch (streetUpper) {
    case 'FLOP':
      return process.env.QDRANT_FLOP_COLLECTION || 'flop_nodes';
    case 'TURN':
      return process.env.QDRANT_TURN_COLLECTION || 'turn_nodes';
    case 'RIVER':
      return process.env.QDRANT_RIVER_COLLECTION || 'river_nodes';
    default:
      // Default to flop_nodes if street is not specified
      return process.env.QDRANT_COLLECTION_NAME || 'flop_nodes';
  }
}

/**
 * Extract board texture features from board cards using Rust napi binding
 * @param {string[]} board - Array of board cards (e.g., ["Ah", "Kd", "Qs"])
 * @returns {number[]} Board texture features as [u8; 8] array
 */
function extractBoardTexture(board) {
  try {
    // Use the Rust implementation which is 10-20x faster
    return extractBoardTextureJs(board);
  } catch (error) {
    console.error('Error extracting board texture with Rust binding:', error);
    // Fallback to a simple default texture if Rust binding fails
    return new Array(8).fill(0);
  }
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
 * Canonicalize action history for consistent hashing using Rust napi binding
 * @param {string[]} actionHistory - Array of action strings
 * @param {number} potAtStart - Pot size before these actions
 * @returns {string} Canonicalized action string
 */
function canonicalizeActionHistory(actionHistory, potAtStart) {
  try {
    // Use the Rust implementation which is ~10x faster
    return canonicalizeActionHistoryRust(actionHistory, potAtStart);
  } catch (error) {
    console.error('Error canonicalizing action history with Rust binding:', error);
    // Fallback to simple join if Rust binding fails
    return actionHistory.join('-');
  }
}

/**
 * Calculate hash of canonicalized action history using Rust napi binding
 * @param {string[]} actionHistory - Array of action strings
 * @param {number} pot - Current pot size
 * @returns {number} 32-bit hash value
 */
function calculateCanonicalActionHash(actionHistory, pot) {
  if (!actionHistory || actionHistory.length === 0) return 0;
  
  try {
    // Use the Rust implementation which is ~10x faster
    return calculateActionHash(actionHistory, pot);
  } catch (error) {
    console.error('Error calculating action hash with Rust binding:', error);
    // Fallback to simple hash if Rust binding fails
    let hash = 0;
    const canonical = actionHistory.join('-');
    for (let i = 0; i < canonical.length; i++) {
      hash = ((hash << 5) - hash + canonical.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
  }
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
 * Build 71-dimension feature vector from SnapshotInput using Rust napi binding
 * 
 * @param {Object} snapshotInput - The snapshot input object
 * @returns {number[]} 71-dimension feature vector
 */
function buildFeatureVector(snapshotInput) {
  try {
    
    // Use the Rust implementation which is 10-50x faster
    return buildFeatureVectorRust(JSON.stringify(snapshotInput));
  } catch (error) {
    console.error('Error building feature vector with Rust binding:', error);
    throw new Error(`Feature vector generation failed: ${error.message}`);
  }
}

/**
 * Find similar node using Qdrant Vector Search with parent fallback strategy
 * @param {Object} snapshotInput - The snapshot input to search for
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object|null>} LeanNodeMeta if found with score > 0.55, null otherwise
 */
async function findSimilarNode(snapshotInput, options = {}) {
  const {
    minScore = 0.55,
    limit = 10,
    enableParentFallback = true, // New option for parent fallback
    maxParentDepth = 2 // Maximum number of actions to remove for parent search
  } = options;

  try {
    // Initialize Qdrant client
    const client = await initializeQdrant();
    const collectionName = getCollectionName(snapshotInput.street);
    
    // Build feature vector (71 dimensions)
    const originalVector = buildFeatureVector(snapshotInput);
    
    console.log(`DEBUG: Built ${originalVector.length}-dimension feature vector`);
    
    // Generate action sequence for filtering
    const actionSequence = generateActionSequence(snapshotInput.action_history || []);
    
    // Build filter conditions for Qdrant
    const filter = {
      must: []
    };
    
    // Always filter by action sequence for exact match
    filter.must.push({
      key: "action_sequence",
      match: {
        value: actionSequence
      }
    });
    
    filter.must.push({
      key: "street",
      match: {
        value: snapshotInput.street
      }
    });
  
    filter.must.push({
      key: "pot_type",
      match: {
        value: snapshotInput.pot_type
      }
    });

    // const texture = getBoardTextureName(snapshotInput.board);
    // filter.must.push({
    //   key: "board_texture",
    //   match: {
    //     value: texture
    //   }
    // });
  

    const queryFlopArchetype = getFlopArchetypeName(snapshotInput.board);
    filter.must.push({
      key: "flop_archetype",
      match: {
        value: queryFlopArchetype,
      }
    });

    // Add position bucket filters if positions are available
    if (snapshotInput.positions && snapshotInput.positions.ip && snapshotInput.positions.oop) {
      const { ip, oop } = snapshotInput.positions;
      const buckets = { ip: getPositionBucket(ip), oop: getPositionBucket(oop) };
      
      // Only add position bucket filters if we have valid buckets
      if (buckets.ip && buckets.oop) {
        const positionFilters = buildPositionBucketFilters(buckets);
        filter.must.push(...positionFilters);
      }
    }
    
    // Perform vector search using Qdrant
    const searchParams = {
      vector: originalVector,
      limit: limit * 3, // Fetch more candidates for filtering
      with_payload: true,
      score_threshold: minScore
    };
    
    // Only add filter if we have conditions
    if (filter.must.length > 0) {
      searchParams.filter = filter;
    }
    
    const searchResults = await client.search(collectionName, searchParams);
    
    // Check if we have valid matches
    if (!searchResults || searchResults.length === 0) {
      // Try parent fallback if enabled
      if (enableParentFallback && snapshotInput.action_history && snapshotInput.action_history.length > 0) {
        console.log('No matches found, attempting parent fallback strategy...');
        return await findSimilarNodeWithParentFallback(snapshotInput, options);
      }
      return null;
    }

    const bestMatch = searchResults[0];

    console.log({ bestMatch })
    
    // Reconstruct the LeanNodeMeta structure from Qdrant payload
    const nodeMetadata = {
      _id: bestMatch.id,
      ...bestMatch.payload,
      matchType: 'exact', // Indicate this is an exact match
      score: bestMatch.score
    };

    return {
      nodeMetadata,
      similarityScore: bestMatch.score,
      isApproximation: bestMatch.score < 0.75 // Flag if score is below high confidence threshold
    };

  } catch (error) {
    console.error('Error in findSimilarNode:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }
}

/**
 * Find similar node using parent fallback strategy
 * Progressively removes actions from the end of action history until a match is found
 * @param {Object} snapshotInput - The original snapshot input
 * @param {Object} options - Configuration options
 * @returns {Promise<Object|null>} LeanNodeMeta if found, null otherwise
 */
async function findSimilarNodeWithParentFallback(snapshotInput, options = {}) {
  const { maxParentDepth = 2, minScore = 0.55 } = options;
  const originalActionHistory = snapshotInput.action_history || [];
  
  if (originalActionHistory.length === 0) {
    return null;
  }
  
  // Try progressively removing actions from the end
  for (let depth = 1; depth <= Math.min(maxParentDepth, originalActionHistory.length); depth++) {
    const parentSnapshot = {
      ...snapshotInput,
      action_history: originalActionHistory.slice(0, -depth)
    };
    
    // Disable parent fallback for these recursive calls to prevent infinite recursion
    const parentOptions = {
      ...options,
      enableParentFallback: false
    };
    
    try {
      const result = await findSimilarNode(parentSnapshot, parentOptions);
      
      if (result) {
        // Mark this as a parent match and include info about removed actions
        const removedActions = originalActionHistory.slice(-depth);
        return {
          ...result,
          nodeMetadata: {
            ...result.nodeMetadata,
            matchType: 'parent',
            parentDepth: depth,
            removedActions: removedActions
          },
          isApproximation: true // Parent matches are always approximations
        };
      }
    } catch (error) {
      console.error(`Error searching for parent at depth ${depth}:`, error);
      // Continue to next depth
    }
  }
  
  console.log(`Parent fallback: No matches found after removing up to ${maxParentDepth} actions`);
  return null;
}

/**
 * Batch find similar nodes for multiple snapshots
 * @param {Object[]} snapshotInputs - Array of snapshot inputs
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object[]>} Array of results (node metadata or null for each input)
 */
async function batchFindSimilarNodes(snapshotInputs, options = {}) {
  try {
    // Process in parallel with controlled concurrency
    const batchSize = options.batchSize || 5;
    const results = [];
    
    for (let i = 0; i < snapshotInputs.length; i += batchSize) {
      const batch = snapshotInputs.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(input => findSimilarNode(input, options))
      );
      results.push(...batchResults);
    }
    
    return results;
  } catch (error) {
    console.error('Error in batchFindSimilarNodes:', error);
    throw error;
  }
}

module.exports = {
  buildFeatureVector,
  findSimilarNode,
  batchFindSimilarNodes,
  // Helper functions using Rust napi bindings
  extractBoardTexture,
  canonicalizeActionHistory,
  calculateCanonicalActionHash,
  generateActionSequence,
  // Qdrant utilities
  initializeQdrant,
};