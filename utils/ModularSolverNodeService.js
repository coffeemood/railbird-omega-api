const s3Helper = require('./s3');

// Import all available NAPI solver functions
const {
    // Core Data Operations
    decodeCompactNode,
    encodeNodeToCompact,
    decompressZstd,
    compressZstd,
    decodeCompressedNode,
    
    // Range Analysis
    calculateRangeEquity,
    calculateRangeAdvantageApi,
    calculateBlockerImpactApi,
    analyzeRangeComplete,
    generateRangeStats,
    
    // Board Analysis
    analyzeBoardTextureApi,
    extractBoardTextureJs,
    
    // Hand Analysis
    analyzeHandFeatures,
    
    // Feature Vector & ML
    buildFeatureVector,
    batchBuildFeatureVectors,
    leanMetaToFeatureVector,
    cosineSimilarity,
    
    // Action Processing
    generateActionSequence,
    canonicalizeActionHistory,
    calculateActionHash,
    formatActionStringJs,
    calculateActionFrequenciesJs,
    parseActionString,
    canonicalizeActionTokens,
    
    // Snapshot Analysis
    analyzeSnapshot,
    
    // Transforms
    transformCompactToSolverBlock,
    
    // Orchestration (legacy monolithic)
    unpackAndTransformNode
} = require('./solver-node');

/**
 * Modular Solver Node Service
 * 
 * This class provides granular access to solver operations, allowing for:
 * - Performance optimization through selective operations
 * - Better testing through isolated, pure functions
 * - Code reuse across different contexts
 * - Easier maintenance through clear separation of concerns
 * - Enhanced flexibility for future feature development
 * 
 * All functions leverage existing NAPI bindings for maximum performance.
 */
class ModularSolverNodeService {
    
    /**
     * Initialize the service with optional configuration
     * @param {Object} config - Service configuration
     * @param {string} config.defaultBucket - Default S3 bucket for solver nodes
     * @param {boolean} config.enableCaching - Enable result caching (future enhancement)
     * @param {boolean} config.enableMetrics - Enable performance metrics collection
     */
    constructor(config = {}) {
        this.config = {
            defaultBucket: config.defaultBucket || process.env.SOLVER_S3_BUCKET || 'solver-nodes',
            enableCaching: config.enableCaching || false,
            enableMetrics: config.enableMetrics || false,
            ...config
        };
        
        // Performance metrics storage
        this.metrics = {
            calls: {},
            totalTime: {},
            averageTime: {}
        };
    }

    /**
     * Measure performance of a function call
     * @private
     */
    _measurePerformance(funcName, asyncFunc) {
        if (!this.config.enableMetrics) {
            return asyncFunc();
        }

        const start = Date.now();
        
        if (asyncFunc.constructor.name === 'AsyncFunction') {
            return asyncFunc().finally(() => {
                this._recordMetric(funcName, Date.now() - start);
            });
        } else {
            try {
                const result = asyncFunc();
                this._recordMetric(funcName, Date.now() - start);
                return result;
            } catch (error) {
                this._recordMetric(funcName, Date.now() - start);
                throw error;
            }
        }
    }

    /**
     * Record performance metric
     * @private
     */
    _recordMetric(funcName, duration) {
        if (!this.metrics.calls[funcName]) {
            this.metrics.calls[funcName] = 0;
            this.metrics.totalTime[funcName] = 0;
        }
        
        this.metrics.calls[funcName]++;
        this.metrics.totalTime[funcName] += duration;
        this.metrics.averageTime[funcName] = this.metrics.totalTime[funcName] / this.metrics.calls[funcName];
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics for all function calls
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics() {
        this.metrics = {
            calls: {},
            totalTime: {},
            averageTime: {}
        };
    }

    // ===========================================
    // CORE DATA OPERATIONS
    // ===========================================

    /**
     * Fetch compressed solver node data from S3
     * @param {Object} leanNodeMeta - LeanNodeMeta containing S3 location
     * @returns {Promise<Buffer>} Compressed node data
     */
    async fetchCompressedNodeData(leanNodeMeta) {
        return this._measurePerformance('fetchCompressedNodeData', async () => {
            if (!leanNodeMeta || !leanNodeMeta.s3_key) {
                throw new Error('Invalid LeanNodeMeta: missing s3_key');
            }

            const {
                s3_bucket,
                s3_key,
                offset = 0,
                length
            } = leanNodeMeta;
            
            const bucket = s3_bucket || this.config.defaultBucket;

            try {
                const s3Data = await s3Helper.getObject(bucket, s3_key);
                
                // Extract specific frame if offset/length provided
                let compressedData = s3Data.Body;
                if (offset > 0 || length) {
                    const endPos = length ? offset + length : undefined;
                    compressedData = s3Data.Body.slice(offset, endPos);
                }

                return compressedData;
            } catch (error) {
                throw new Error(`Failed to fetch compressed node data: ${error.message}`);
            }
        });
    }

    /**
     * Decode compressed node data to JSON
     * @param {Buffer} compressedData - Zstd compressed bincode data
     * @returns {Object} Decoded CompactNodeAnalysis object
     */
    decodeCompressedNode(compressedData) {
        return this._measurePerformance('decodeCompressedNode', () => {
            try {
                return JSON.parse(decodeCompressedNode(compressedData));
            } catch (error) {
                throw new Error(`Failed to decode compressed node: ${error.message}`);
            }
        });
    }

    /**
     * Decode uncompressed node data to JSON
     * @param {Buffer} nodeData - Bincode data (uncompressed)
     * @returns {Object} Decoded CompactNodeAnalysis object
     */
    decodeNode(nodeData) {
        return this._measurePerformance('decodeNode', () => {
            try {
                return JSON.parse(decodeCompactNode(nodeData));
            } catch (error) {
                throw new Error(`Failed to decode node: ${error.message}`);
            }
        });
    }

    /**
     * Fetch and decode a solver node in one operation
     * @param {Object} leanNodeMeta - LeanNodeMeta containing S3 location
     * @returns {Promise<Object>} Decoded CompactNodeAnalysis object
     */
    async fetchAndDecodeNode(leanNodeMeta) {
        return this._measurePerformance('fetchAndDecodeNode', async () => {
            const compressedData = await this.fetchCompressedNodeData(leanNodeMeta);
            return this.decodeCompressedNode(compressedData);
        });
    }

    // ===========================================
    // RANGE ANALYSIS OPERATIONS
    // ===========================================

    /**
     * Calculate equity between two ranges
     * @param {string} oopRange - OOP range string
     * @param {string} ipRange - IP range string  
     * @param {string[]} board - Board cards array
     * @param {string} nextToAct - Next player to act ("oop" or "ip")
     * @returns {Object} Range equity analysis
     */
    calculateRangeEquity(oopRange, ipRange, board, nextToAct = "oop") {
        return this._measurePerformance('calculateRangeEquity', () => {
            try {
                const result = calculateRangeEquity(oopRange, ipRange, board, nextToAct);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to calculate range equity: ${error.message}`);
            }
        });
    }

    /**
     * Analyze range advantage between positions 
     * @param {string} heroRangeStr - Hero range string 
     * @param {string} villainRangeStr - Villain range string
     * @param {Array<string>} board - Board cards
     * @returns {Object} Range advantage analysis
     */
    analyzeRangeAdvantage(heroRangeStr, villainRangeStr, board) {
        return this._measurePerformance('analyzeRangeAdvantage', () => {
            try {
                const result = calculateRangeAdvantageApi(heroRangeStr, villainRangeStr, board);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to analyze range advantage: ${error.message}`);
            }
        });
    }

    /**
     * Calculate blocker impact for a specific hand
     * @param {string} heroHand - Hero hand (e.g., "AhKh")
     * @param {string} villainRange - Villain range string
     * @param {string[]} board - Board cards array
     * @returns {Object} Blocker impact analysis
     */
    calculateBlockerImpact(heroHand, villainRange, board) {
        return this._measurePerformance('calculateBlockerImpact', () => {
            try {
                const result = calculateBlockerImpactApi(heroHand, villainRange, board);
                const parsed = JSON.parse(result);
                parsed.topBlocked = parsed.topBlocked.map((cat) => ({ ...cat, percentage: cat.percentage.toFixed(2) }));
                return parsed;
            } catch (error) {
                throw new Error(`Failed to calculate blocker impact: ${error.message}`);
            }
        });
    }

    /**
     * Perform complete range analysis
     * @param {string} heroHand - Hero hand (e.g., "AhKh")
     * @param {string} villainRange - Villain range string
     * @param {string[]} board - Board cards array
     * @param {string} heroRange - Optional hero range string
     * @returns {Object} Complete range analysis
     */
    analyzeRangeComplete(heroHand, villainRange, board, heroRange = null) {
        return this._measurePerformance('analyzeRangeComplete', () => {
            try {
                const result = analyzeRangeComplete(heroHand, villainRange, board, heroRange);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to perform complete range analysis: ${error.message}`);
            }
        });
    }

    /**
     * Generate range statistics
     * @param {Object} rangeData - Range data object
     * @returns {Object} Range statistics
     */
    generateRangeStats(rangeData) {
        return this._measurePerformance('generateRangeStats', () => {
            try {
                const dataJson = typeof rangeData === 'string' ? rangeData : JSON.stringify(rangeData);
                const result = generateRangeStats(dataJson);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to generate range stats: ${error.message}`);
            }
        });
    }

    // ===========================================
    // BOARD ANALYSIS OPERATIONS
    // ===========================================

    /**
     * Analyze board texture
     * @param {string[]} board - Board cards array
     * @returns {Object} Board texture analysis
     */
    analyzeBoardTexture(board) {
        return this._measurePerformance('analyzeBoardTexture', () => {
            try {
                const result = analyzeBoardTextureApi(board);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to analyze board texture: ${error.message}`);
            }
        });
    }

    /**
     * Extract board texture features for ML
     * @param {string[]} board - Board cards array
     * @returns {Object} Board texture features
     */
    extractBoardTexture(board) {
        return this._measurePerformance('extractBoardTexture', () => {
            try {
                const result = extractBoardTextureJs(board);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to extract board texture: ${error.message}`);
            }
        });
    }

    // ===========================================
    // HAND ANALYSIS OPERATIONS
    // ===========================================

    /**
     * Analyze hand features
     * @param {string} heroHand - Hero hand (e.g., "AhKh")
     * @param {string} villainRange - Villain range string
     * @param {string[]} board - Board cards array
     * @returns {Object} Hand features analysis
     */
    analyzeHandFeatures(heroHand, board, villainRange) {
        return this._measurePerformance('analyzeHandFeatures', () => {
            try {
                const result = analyzeHandFeatures(heroHand, board, villainRange);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to analyze hand features: ${error.message}`);
            }
        });
    }

    // ===========================================
    // FEATURE VECTOR & ML OPERATIONS
    // ===========================================

    /**
     * Build feature vector from snapshot
     * @param {Object} snapshot - Snapshot input object
     * @returns {number[]} Feature vector array
     */
    buildFeatureVector(snapshot) {
        return this._measurePerformance('buildFeatureVector', () => {
            try {
                const snapshotJson = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
                return buildFeatureVector(snapshotJson);
            } catch (error) {
                throw new Error(`Failed to build feature vector: ${error.message}`);
            }
        });
    }

    /**
     * Build feature vectors for multiple snapshots
     * @param {Object[]} snapshots - Array of snapshot objects
     * @returns {number[][]} Array of feature vectors
     */
    batchBuildFeatureVectors(snapshots) {
        return this._measurePerformance('batchBuildFeatureVectors', () => {
            try {
                const snapshotsJson = JSON.stringify(snapshots);
                return batchBuildFeatureVectors(snapshotsJson);
            } catch (error) {
                throw new Error(`Failed to batch build feature vectors: ${error.message}`);
            }
        });
    }

    /**
     * Convert lean metadata to feature vector
     * @param {Object} leanMeta - LeanNodeMeta object
     * @returns {number[]} Feature vector array
     */
    leanMetaToFeatureVector(leanMeta) {
        return this._measurePerformance('leanMetaToFeatureVector', () => {
            try {
                const metaJson = typeof leanMeta === 'string' ? leanMeta : JSON.stringify(leanMeta);
                return leanMetaToFeatureVector(metaJson);
            } catch (error) {
                throw new Error(`Failed to convert lean meta to feature vector: ${error.message}`);
            }
        });
    }

    /**
     * Calculate cosine similarity between vectors
     * @param {number[]} vector1 - First vector
     * @param {number[]} vector2 - Second vector
     * @returns {number} Cosine similarity score
     */
    calculateCosineSimilarity(vector1, vector2) {
        return this._measurePerformance('calculateCosineSimilarity', () => {
            try {
                return cosineSimilarity(vector1, vector2);
            } catch (error) {
                throw new Error(`Failed to calculate cosine similarity: ${error.message}`);
            }
        });
    }

    // ===========================================
    // ACTION PROCESSING OPERATIONS
    // ===========================================

    /**
     * Generate action sequence
     * @param {Object} actionData - Action data object
     * @returns {Object} Generated action sequence
     */
    generateActionSequence(actionData) {
        return this._measurePerformance('generateActionSequence', () => {
            try {
                const dataJson = typeof actionData === 'string' ? actionData : JSON.stringify(actionData);
                const result = generateActionSequence(dataJson);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to generate action sequence: ${error.message}`);
            }
        });
    }

    /**
     * Canonicalize action history
     * @param {string[]} actionHistory - Array of action strings
     * @param {number} potAtStart - Pot size at start
     * @returns {string} Canonicalized action history
     */
    canonicalizeActionHistory(actionHistory, potAtStart) {
        return this._measurePerformance('canonicalizeActionHistory', () => {
            try {
                return canonicalizeActionHistory(actionHistory, potAtStart);
            } catch (error) {
                throw new Error(`Failed to canonicalize action history: ${error.message}`);
            }
        });
    }

    /**
     * Calculate action hash
     * @param {string[]} actionHistory - Array of action strings
     * @returns {string} Action hash
     */
    calculateActionHash(actionHistory) {
        return this._measurePerformance('calculateActionHash', () => {
            try {
                return calculateActionHash(actionHistory);
            } catch (error) {
                throw new Error(`Failed to calculate action hash: ${error.message}`);
            }
        });
    }

    /**
     * Calculate action frequencies
     * @param {Object} actionData - Action data object
     * @returns {Object} Action frequencies
     */
    calculateActionFrequencies(actionData) {
        return this._measurePerformance('calculateActionFrequencies', () => {
            try {
                const dataJson = typeof actionData === 'string' ? actionData : JSON.stringify(actionData);
                const result = calculateActionFrequenciesJs(dataJson);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to calculate action frequencies: ${error.message}`);
            }
        });
    }

    /**
     * Parse action string
     * @param {string} actionString - Action string to parse
     * @returns {Object} Parsed action object
     */
    parseActionString(actionString) {
        return this._measurePerformance('parseActionString', () => {
            try {
                const result = parseActionString(actionString);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to parse action string: ${error.message}`);
            }
        });
    }

    /**
     * Format action string
     * @param {Object} actionObject - Action object to format
     * @returns {string} Formatted action string
     */
    formatActionString(actionObject) {
        return this._measurePerformance('formatActionString', () => {
            try {
                const objectJson = typeof actionObject === 'string' ? actionObject : JSON.stringify(actionObject);
                return formatActionStringJs(objectJson);
            } catch (error) {
                throw new Error(`Failed to format action string: ${error.message}`);
            }
        });
    }

    // ===========================================
    // SNAPSHOT ANALYSIS OPERATIONS
    // ===========================================

    /**
     * Analyze snapshot
     * @param {Object} snapshot - Snapshot object to analyze
     * @returns {Object} Snapshot analysis
     */
    analyzeSnapshot(snapshot) {
        return this._measurePerformance('analyzeSnapshot', () => {
            try {
                const snapshotJson = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
                const result = analyzeSnapshot(snapshotJson);
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to analyze snapshot: ${error.message}`);
            }
        });
    }

    // ===========================================
    // TRANSFORM OPERATIONS
    // ===========================================

    /**
     * Transform CompactNodeAnalysis to SolverBlock format
     * @param {Object} nodeData - CompactNodeAnalysis object
     * @param {Object} snapshot - Snapshot input object
     * @param {number} similarityScore - Similarity score (default: 1.0)
     * @param {string} heroHand - Optional hero hand
     * @returns {Object} SolverBlock object
     */
    transformToSolverBlock(nodeData, snapshot, similarityScore = 1.0, heroHand = null) {
        return this._measurePerformance('transformToSolverBlock', () => {
            try {
                const nodeJson = typeof nodeData === 'string' ? nodeData : JSON.stringify(nodeData);
                const snapshotJson = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
                
                const result = transformCompactToSolverBlock(
                    nodeJson,
                    snapshotJson,
                    similarityScore,
                    heroHand
                );
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to transform to solver block: ${error.message}`);
            }
        });
    }

    // ===========================================
    // HIGH-LEVEL GRANULAR OPERATIONS
    // ===========================================

    /**
     * Get only equity analysis
     * @param {string} oopRange - OOP range string
     * @param {string} ipRange - IP range string
     * @param {string[]} board - Board cards array
     * @param {string} nextToAct - Next player to act
     * @returns {Object} Equity analysis only
     */
    async getEquityOnly(oopRange, ipRange, board, nextToAct = "oop") {
        return this._measurePerformance('getEquityOnly', async () => {
            return this.calculateRangeEquity(oopRange, ipRange, board, nextToAct);
        });
    }

    /**
     * Get only board analysis
     * @param {string[]} board - Board cards array
     * @returns {Object} Board analysis only
     */
    async getBoardAnalysisOnly(board) {
        return this._measurePerformance('getBoardAnalysisOnly', async () => {
            return this.analyzeBoardTexture(board);
        });
    }

    /**
     * Get only range advantage analysis from a node
     * @param {Object|string} nodeData - CompactNodeAnalysis object or JSON string
     * @param {string} heroPosition - Hero position ("oop" or "ip")
     * @returns {Object} Range advantage analysis only
     */
    async getRangeAdvantageOnly(nodeData, heroPosition) {
        return this._measurePerformance('getRangeAdvantageOnly', async () => {
            return this.analyzeRangeAdvantage(nodeData, heroPosition);
        });
    }

    /**
     * Get only blocker analysis
     * @param {string} heroHand - Hero hand
     * @param {string} villainRange - Villain range string  
     * @param {string[]} board - Board cards array
     * @returns {Object} Blocker analysis only
     */
    async getBlockerAnalysisOnly(heroHand, villainRange, board) {
        return this._measurePerformance('getBlockerAnalysisOnly', async () => {
            return this.calculateBlockerImpact(heroHand, villainRange, board);
        });
    }

    /**
     * Get only hand features analysis
     * @param {string} heroHand - Hero hand
     * @param {string} villainRange - Villain range string
     * @param {string[]} board - Board cards array
     * @returns {Object} Hand features analysis only
     */
    async getHandFeaturesOnly(heroHand, villainRange, board) {
        return this._measurePerformance('getHandFeaturesOnly', async () => {
            return this.analyzeHandFeatures(heroHand, villainRange, board);
        });
    }

    /**
     * Get custom analysis based on configuration
     * @param {Object} leanNodeMeta - LeanNodeMeta object
     * @param {Object} analysisOptions - Analysis configuration
     * @param {boolean} analysisOptions.includeEquity - Include equity analysis
     * @param {boolean} analysisOptions.includeBoardTexture - Include board texture
     * @param {boolean} analysisOptions.includeRangeAdvantage - Include range advantage
     * @param {boolean} analysisOptions.includeBlockerAnalysis - Include blocker analysis
     * @param {boolean} analysisOptions.includeHandFeatures - Include hand features
     * @param {string} analysisOptions.heroHand - Hero hand for analysis
     * @param {string} analysisOptions.heroPosition - Hero position
     * @param {string[]} analysisOptions.board - Board cards
     * @param {string} analysisOptions.oopRange - OOP range string
     * @param {string} analysisOptions.ipRange - IP range string
     * @returns {Promise<Object>} Custom analysis results
     */
    async getCustomAnalysis(leanNodeMeta, analysisOptions) {
        return this._measurePerformance('getCustomAnalysis', async () => {
            const results = {};
            
            // Fetch and decode node if needed for range advantage
            let nodeData = null;
            if (analysisOptions.includeRangeAdvantage) {
                nodeData = await this.fetchAndDecodeNode(leanNodeMeta);
            }
            
            // Run requested analyses in parallel for performance
            const promises = [];
            
            if (analysisOptions.includeEquity && analysisOptions.oopRange && analysisOptions.ipRange) {
                promises.push(
                    this.getEquityOnly(
                        analysisOptions.oopRange, 
                        analysisOptions.ipRange, 
                        analysisOptions.board
                    ).then(equity => { results.equity = equity; })
                );
            }
            
            if (analysisOptions.includeBoardTexture && analysisOptions.board) {
                promises.push(
                    this.getBoardAnalysisOnly(analysisOptions.board)
                        .then(boardTexture => { results.boardTexture = boardTexture; })
                );
            }
            
            if (analysisOptions.includeRangeAdvantage && nodeData && analysisOptions.heroPosition) {
                promises.push(
                    this.getRangeAdvantageOnly(nodeData, analysisOptions.heroPosition)
                        .then(rangeAdvantage => { results.rangeAdvantage = rangeAdvantage; })
                );
            }
            
            if (analysisOptions.includeBlockerAnalysis && analysisOptions.heroHand) {
                promises.push(
                    this.getBlockerAnalysisOnly(
                        analysisOptions.heroHand,
                        analysisOptions.villainRange || analysisOptions.ipRange,
                        analysisOptions.board
                    ).then(blockerImpact => { results.blockerImpact = blockerImpact; })
                );
            }
            
            if (analysisOptions.includeHandFeatures && analysisOptions.heroHand) {
                promises.push(
                    this.getHandFeaturesOnly(
                        analysisOptions.heroHand,
                        analysisOptions.villainRange || analysisOptions.ipRange,
                        analysisOptions.board
                    ).then(handFeatures => { results.handFeatures = handFeatures; })
                );
            }
            
            await Promise.all(promises);
            
            return results;
        });
    }

    /**
     * Batch equity calculations for multiple queries
     * @param {Object[]} equityQueries - Array of equity query objects
     * @param {string} equityQueries[].oopRange - OOP range string
     * @param {string} equityQueries[].ipRange - IP range string
     * @param {string[]} equityQueries[].board - Board cards array
     * @param {string} equityQueries[].nextToAct - Next player to act
     * @returns {Promise<Object[]>} Array of equity results
     */
    async batchCalculateEquities(equityQueries) {
        return this._measurePerformance('batchCalculateEquities', async () => {
            return Promise.all(
                equityQueries.map(query => 
                    this.getEquityOnly(
                        query.oopRange, 
                        query.ipRange, 
                        query.board, 
                        query.nextToAct
                    )
                )
            );
        });
    }

    // ===========================================
    // LEGACY COMPATIBILITY
    // ===========================================

    /**
     * Legacy monolithic unpack and transform (for backward compatibility)
     * @param {Object} leanNodeMeta - LeanNodeMeta object
     * @param {Object} snapshotInput - Snapshot input object
     * @param {number} similarityScore - Similarity score
     * @param {string} heroHand - Hero hand
     * @returns {Promise<Object>} Complete SolverBlock
     */
    async getUnpackedAndTransformedNode(leanNodeMeta, snapshotInput, similarityScore = 1.0, heroHand = null) {
        return this._measurePerformance('getUnpackedAndTransformedNode', async () => {
            const compressedData = await this.fetchCompressedNodeData(leanNodeMeta);
            
            // Build feature vector and pad to 512 dimensions
            const originalVector = this.buildFeatureVector(snapshotInput);
            const queryVector512 = [...originalVector];
            while (queryVector512.length < 512) {
                queryVector512.push(0.0);
            }
            
            try {
                const result = unpackAndTransformNode(
                    compressedData,
                    JSON.stringify(snapshotInput),
                    queryVector512,
                    heroHand
                );
                return JSON.parse(result);
            } catch (error) {
                throw new Error(`Failed to get unpacked and transformed node: ${error.message}`);
            }
        });
    }
}

module.exports = ModularSolverNodeService;