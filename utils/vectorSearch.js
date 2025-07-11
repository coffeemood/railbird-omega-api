const { Pinecone } = require('@pinecone-database/pinecone');

// Import solver-node napi bindings
const { 
  buildFeatureVector: buildFeatureVectorRust,
  extractBoardTextureJs,
  canonicalizeActionHistory: canonicalizeActionHistoryRust,
  calculateActionHash
} = require('./solver-node');

// Pinecone client (singleton)
let pineconeClient = null;
let pineconeIndex = null;

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
 * Initialize Pinecone client (lazy initialization)
 */
async function initializePinecone() {
  if (!pineconeClient) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY environment variable is required');
    }
    
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    const indexName = process.env.PINECONE_INDEX_NAME || 'railbird-solver-nodes';
    pineconeIndex = pineconeClient.index(indexName);
    
    console.log(`✅ Initialized Pinecone client with index: ${indexName}`);
  }
  
  return pineconeIndex;
}

// Note: Position mappings, street encodings, and other constants are now handled 
// internally by the Rust napi bindings for optimal performance and consistency

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

// Note: Action parsing and bet ratio bucketing are now handled internally by Rust napi bindings

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
 * Remove closing actions from action history for turn/river snapshots
 * This handles the case where the vector corpus has incomplete action histories
 * (missing closing actions from flop) due to mass solve without proper closing
 * @param {string[]} actionHistory - Array of action strings
 * @param {string} street - Current street (flop, turn, river)
 * @returns {string[]} Action history with closing actions removed
 */
function removeClosingActions(actionHistory, street) {
  // Only apply to turn and river (corpus was built from flop without proper closing)
  if (street.toLowerCase() !== 'turn' && street.toLowerCase() !== 'river') {
    return actionHistory;
  }
  
  if (!actionHistory || actionHistory.length === 0) {
    return actionHistory;
  }
  
  const cleaned = [...actionHistory];
  let i = 0;
  
  while (i < cleaned.length) {
    const action = cleaned[i].toLowerCase();
    
    // Remove Call actions that follow aggressive actions (these are likely closing actions)
    if (action.startsWith('call') && i > 0) {
      const prevAction = cleaned[i - 1].toLowerCase();
      if (prevAction.startsWith('bet') || 
          prevAction.startsWith('raise') || 
          prevAction.startsWith('all-in') || 
          prevAction.startsWith('allin')) {
        // This Call likely closes a street - remove it
        cleaned.splice(i, 1);
        continue; // Don't increment i since we removed an element
      }
    }
    
    // Remove redundant Check-Check sequences that might indicate street closing
    if (action.startsWith('check') && i > 0) {
      const prevAction = cleaned[i - 1].toLowerCase();
      if (prevAction.startsWith('check')) {
        // Second check in sequence might be a closing action - remove it
        cleaned.splice(i, 1);
        continue; // Don't increment i since we removed an element
      }
    }
    
    i++;
  }
  
  return cleaned;
}

/**
 * Build 73-dimension feature vector from SnapshotInput using Rust napi binding
 * 
 * @param {Object} snapshotInput - The snapshot input object
 * @returns {number[]} 73-dimension feature vector
 */
function buildFeatureVector(snapshotInput) {
  try {
    // Preprocess snapshot to handle corpus with incomplete action histories
    const modifiedSnapshot = {
      ...snapshotInput,
      action_history: removeClosingActions(snapshotInput.action_history, snapshotInput.street)
    };
    
    // Use the Rust implementation which is 10-50x faster
    return buildFeatureVectorRust(JSON.stringify(modifiedSnapshot));
  } catch (error) {
    console.error('Error building feature vector with Rust binding:', error);
    throw new Error(`Feature vector generation failed: ${error.message}`);
  }
}

/**
 * Find similar node using Pinecone Vector Search
 * @param {Object} snapshotInput - The snapshot input to search for
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object|null>} LeanNodeMeta if found with score > 0.55, null otherwise
 */
async function findSimilarNode(snapshotInput, options = {}) {
  const {
    minScore = 0.55,
    limit = 1,
    filter = {} // Pinecone metadata filters
  } = options;

  try {
    // Initialize Pinecone client
    const index = await initializePinecone();
    
    // Build 73-dimension feature vector and pad to match Pinecone index dimension
    const originalVector = buildFeatureVector(snapshotInput);
    
    console.log(`DEBUG: Built ${originalVector.length}-dimension feature vector`);

    function getPotTypeValue(potType) {
      switch (potType.toLowerCase()) {
        case 'srp': return 0;
        case '3bp': return 1;
        case '4bp': return 2;
        default: return 0;
      }
    }
    
    const targetDimension = parseInt(process.env.PINECONE_VECTOR_DIMENSION) || 512;
    const queryVector = [...originalVector];
    
    // Pad with zeros to reach target dimension
    while (queryVector.length < targetDimension) {
      queryVector.push(0.0);
    }
    
    // Perform vector search using Pinecone
    const queryRequest = {
      vector: queryVector,
      topK: limit * 3, // Fetch more candidates for filtering
      includeMetadata: true,
      includeValues: false
    };

    const queryResults = await index.query(queryRequest);
    
    if (!queryResults.matches || queryResults.matches.length === 0) {
      return null;
    }

    // Filter by minimum score and get the best match
    const validMatches = queryResults.matches.filter(match => match.score >= minScore);
    
    if (validMatches.length === 0) {
      return null;
    }

    const bestMatch = validMatches[0];
    
    // Reconstruct the LeanNodeMeta structure from Pinecone metadata
    const nodeMetadata = {
      _id: bestMatch.id,
      ...bestMatch.metadata
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
  // Pinecone utilities
  initializePinecone,
  // Export removeClosingActions for use in solverNodeService
  removeClosingActions
};