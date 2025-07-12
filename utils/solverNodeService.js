const s3Helper = require('./s3');
// Note: ZSTDDecompress no longer needed - using Rust for decompression

// Import solver-node napi bindings
const { 
  decodeCompactNode,
  transformCompactToSolverBlock,
  decodeCompressedNode,
  unpackAndTransformNode
} = require('./solver-node');

// Import buildFeatureVector to generate query vector
const { buildFeatureVector } = require('./vectorSearch');

// Import Solves collection for flop nodes
const Solves = require('../db/collections/Solves');

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
 * Decode Bincode-encoded data to JSON using Rust napi binding
 * 
 * @param {Buffer} buffer - Bincode encoded data
 * @param {boolean} isCompressed - Whether the buffer is zstd-compressed
 * @returns {Object} Decoded CompactNodeAnalysis object
 */
function decodeBincode(buffer, isCompressed = false) {
  try {
    if (isCompressed) {
      // Use the Rust implementation for both decompression and bincode decoding
      return JSON.parse(decodeCompressedNode(buffer));
    } else {
      // Use the Rust implementation for just bincode decoding
      return JSON.parse(decodeCompactNode(buffer));
    }
  } catch (error) {
    throw new Error(`Failed to decode Bincode data: ${error.message}`);
  }
}

/**
 * Fetch and unpack a solver node from S3
 * @param {Object} leanNodeMeta - The LeanNodeMeta object containing S3 location
 * @returns {Promise<Object>} Unpacked CompactNodeAnalysis object
 */
async function getUnpackedNode(leanNodeMeta) {
  if (!leanNodeMeta || !leanNodeMeta.s3_key) {
    throw new Error('Invalid LeanNodeMeta: missing s3_key');
  }

  // Extract S3 location from LeanNodeMeta
  // Note: In the Rust types, s3_bucket is optional in some structs
  const {
    s3_bucket,
    s3_key,
    offset = 0,
    length
  } = leanNodeMeta;
  
  // Use provided bucket or fall back to default
  const bucket = s3_bucket || process.env.SOLVER_S3_BUCKET || 'solver-nodes';

  try {
    // Fetch the compressed data from S3
    const s3Data = await s3Helper.getObject(bucket, s3_key);
    
    // Extract the specific frame if offset/length are provided
    let compressedData = s3Data.Body;
    if (offset > 0 || length) {
      const endPos = length ? offset + length : undefined;
      compressedData = s3Data.Body.slice(offset, endPos);
    }

    // Use Rust for both decompression and bincode decoding (much faster)
    const nodeAnalysis = decodeBincode(compressedData, true);

    return nodeAnalysis;

  } catch (error) {
    console.error('Error fetching/unpacking node:', error);
    throw new Error(`Failed to get unpacked node: ${error.message}`);
  }
}

// Note: Action transformation and combo data extraction are now handled 
// internally by the Rust napi bindings for optimal performance

/**
 * Fetch, unpack, and transform a solver node in one efficient operation
 * This is the most performance-optimized approach for the complete pipeline
 * @param {Object} leanNodeMeta - The LeanNodeMeta object containing S3 location
 * @param {Object} snapshotInput - The snapshot input object
 * @param {number} similarityScore - Similarity score from vector search
 * @param {string} heroHand - Optional hero hand (e.g., "AhKh")
 * @returns {Promise<Object>} SolverBlock directly without intermediate conversions
 */
async function getUnpackedAndTransformedNode(leanNodeMeta, snapshotInput, similarityScore = 1.0, heroHand = null) {
  console.log({ leanNodeMeta })
  if (!leanNodeMeta || !leanNodeMeta.s3_key) {
    throw new Error('Invalid LeanNodeMeta: missing s3_key');
  }

  const {
    s3_bucket,
    s3_key,
    offset = 0,
    length
  } = leanNodeMeta;
  
  const bucket = s3_bucket || process.env.SOLVER_S3_BUCKET || 'solver-nodes';

  try {
    // Fetch the compressed data from S3
    const s3Data = await s3Helper.getObject(bucket, s3_key);
    
    // Extract the specific frame if offset/length are provided
    let compressedData = s3Data.Body;
    if (offset > 0 || length) {
      const endPos = length ? offset + length : undefined;
      compressedData = s3Data.Body.slice(offset, endPos);
    }

    const fs = require('fs');
    // also save the compressed data to a file
    fs.writeFileSync(`compressedData_${snapshotInput.street}.zstd`, compressedData);

    // Build feature vector using the modified snapshot and pad to 512 dimensions
    const originalVector = buildFeatureVector(snapshotInput);
    const queryVector512 = [...originalVector];
    
    // Pad with zeros to reach 512 dimensions
    while (queryVector512.length < 512) {
      queryVector512.push(0.0);
    }

    // Extract hero hand from snapshot if available
    const heroHandFromSnapshot = snapshotInput.heroCards || heroHand;
    
    // Call Rust function with modified snapshot that has cleaned action history
    const solverBlockJson = unpackAndTransformNode(
      compressedData,
      JSON.stringify(snapshotInput),
      queryVector512,
      heroHandFromSnapshot
    );

    const result = JSON.parse(solverBlockJson);

    if (snapshotInput.street === 'TURN' && !result.optimalStrategy?.actionFrequencies?.length) {
      // Use fallback metadata
      result.optimalStrategy = JSON.parse(leanNodeMeta.optimal_strategy);
      delete result.rangeAdvantage  // combo data error
      delete result.handFeatures;
    }

    return result;

  } catch (error) {
    console.error('Error in efficient unpack and transform:', error);
    throw new Error(`Failed to get unpacked and transformed node: ${error.message}`);
  }
}

/**
 * Transform CompactNodeAnalysis to SolverBlock format for frontend using Rust napi binding
 * @param {Object} compactNodeAnalysis - CompactNodeAnalysis object from bincode
 * @param {Object} snapshot - The snapshot input object
 * @param {number} similarityScore - Similarity score from vector search
 * @param {string} heroHand - Optional hero hand (e.g., "AhKh")
 * @returns {Object} SolverBlock formatted for frontend
 */
function transformNodeToSolverBlock(compactNodeAnalysis, snapshot, similarityScore = 1.0, heroHand = null) {
  if (!compactNodeAnalysis) {
    throw new Error('Invalid CompactNodeAnalysis: null or undefined');
  }

  try {
    // Use the Rust implementation which provides comprehensive transformation
    // including range analysis, blocker calculations, and board texture analysis
    return JSON.parse(transformCompactToSolverBlock(
      JSON.stringify(compactNodeAnalysis),
      JSON.stringify(snapshot),
      similarityScore,
      heroHand
    ));
  } catch (error) {
    console.error('Error transforming node with Rust binding:', error);
    
    // Fallback to basic transformation if Rust binding fails
    return {
      nodeId: compactNodeAnalysis.node_id || 'unknown',
      sim: similarityScore,
      boardAnalysis: {
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
          ev: 0
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
  processSnapshotWithSolverData,
  batchProcessSnapshots
};