const ModularSolverNodeService = require('../ModularSolverNodeService');

// Mock the solver-node NAPI bindings
jest.mock('../solver-node', () => ({
    // Core Data Operations
    decodeCompactNode: jest.fn(),
    encodeNodeToCompact: jest.fn(),
    decompressZstd: jest.fn(),
    compressZstd: jest.fn(),
    decodeCompressedNode: jest.fn(),
    
    // Range Analysis
    calculateRangeEquity: jest.fn(),
    calculateRangeAdvantageApi: jest.fn(),
    calculateBlockerImpactApi: jest.fn(),
    analyzeRangeComplete: jest.fn(),
    generateRangeStats: jest.fn(),
    
    // Board Analysis
    analyzeBoardTextureApi: jest.fn(),
    extractBoardTextureJs: jest.fn(),
    
    // Hand Analysis
    analyzeHandFeatures: jest.fn(),
    
    // Feature Vector & ML
    buildFeatureVector: jest.fn(),
    batchBuildFeatureVectors: jest.fn(),
    leanMetaToFeatureVector: jest.fn(),
    cosineSimilarity: jest.fn(),
    
    // Action Processing
    generateActionSequence: jest.fn(),
    canonicalizeActionHistory: jest.fn(),
    calculateActionHash: jest.fn(),
    formatActionStringJs: jest.fn(),
    calculateActionFrequenciesJs: jest.fn(),
    parseActionString: jest.fn(),
    canonicalizeActionTokens: jest.fn(),
    
    // Snapshot Analysis
    analyzeSnapshot: jest.fn(),
    
    // Transforms
    transformCompactToSolverBlock: jest.fn(),
    
    // Orchestration
    unpackAndTransformNode: jest.fn()
}));

// Mock S3 helper
jest.mock('../s3', () => ({
    getObject: jest.fn()
}));

const { 
    calculateRangeEquity,
    analyzeBoardTextureApi,
    calculateBlockerImpactApi,
    analyzeHandFeatures,
    buildFeatureVector,
    decodeCompressedNode,
    transformCompactToSolverBlock,
    unpackAndTransformNode
} = require('../solver-node');

const s3Helper = require('../s3');

describe('ModularSolverNodeService', () => {
    let service;
    
    beforeEach(() => {
        service = new ModularSolverNodeService({
            enableMetrics: true,
            defaultBucket: 'test-bucket'
        });
        
        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('Configuration and Initialization', () => {
        test('should initialize with default configuration', () => {
            const defaultService = new ModularSolverNodeService();
            expect(defaultService.config.defaultBucket).toBe('solver-nodes');
            expect(defaultService.config.enableCaching).toBe(false);
            expect(defaultService.config.enableMetrics).toBe(false);
        });

        test('should initialize with custom configuration', () => {
            const customService = new ModularSolverNodeService({
                defaultBucket: 'custom-bucket',
                enableCaching: true,
                enableMetrics: true
            });
            
            expect(customService.config.defaultBucket).toBe('custom-bucket');
            expect(customService.config.enableCaching).toBe(true);
            expect(customService.config.enableMetrics).toBe(true);
        });
    });

    describe('Performance Metrics', () => {
        test('should record performance metrics when enabled', () => {
            calculateRangeEquity.mockReturnValue(JSON.stringify({ oop_equity: 45.2, ip_equity: 54.8 }));
            
            service.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc']);
            
            const metrics = service.getMetrics();
            expect(metrics.calls.calculateRangeEquity).toBe(1);
            expect(metrics.totalTime.calculateRangeEquity).toBeGreaterThan(0);
            expect(metrics.averageTime.calculateRangeEquity).toBeGreaterThan(0);
        });

        test('should reset metrics', () => {
            calculateRangeEquity.mockReturnValue(JSON.stringify({ oop_equity: 45.2, ip_equity: 54.8 }));
            
            service.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc']);
            expect(service.getMetrics().calls.calculateRangeEquity).toBe(1);
            
            service.resetMetrics();
            expect(service.getMetrics().calls).toEqual({});
        });

        test('should not record metrics when disabled', () => {
            const noMetricsService = new ModularSolverNodeService({ enableMetrics: false });
            calculateRangeEquity.mockReturnValue(JSON.stringify({ oop_equity: 45.2, ip_equity: 54.8 }));
            
            noMetricsService.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc']);
            
            const metrics = noMetricsService.getMetrics();
            expect(Object.keys(metrics.calls)).toHaveLength(0);
        });
    });

    describe('Core Data Operations', () => {
        test('fetchCompressedNodeData should fetch data from S3', async () => {
            const mockData = Buffer.from('compressed data');
            s3Helper.getObject.mockResolvedValue({ Body: mockData });
            
            const leanNodeMeta = {
                s3_bucket: 'test-bucket',
                s3_key: 'test-key'
            };
            
            const result = await service.fetchCompressedNodeData(leanNodeMeta);
            
            expect(s3Helper.getObject).toHaveBeenCalledWith('test-bucket', 'test-key');
            expect(result).toBe(mockData);
        });

        test('fetchCompressedNodeData should handle offset and length', async () => {
            const mockData = Buffer.from('compressed data with extra bytes');
            s3Helper.getObject.mockResolvedValue({ Body: mockData });
            
            const leanNodeMeta = {
                s3_key: 'test-key',
                offset: 5,
                length: 10
            };
            
            const result = await service.fetchCompressedNodeData(leanNodeMeta);
            
            expect(result).toEqual(mockData.slice(5, 15));
        });

        test('fetchCompressedNodeData should throw error for missing s3_key', async () => {
            await expect(service.fetchCompressedNodeData({})).rejects.toThrow('Invalid LeanNodeMeta: missing s3_key');
        });

        test('decodeCompressedNode should decode compressed data', () => {
            const mockNodeData = { node_id: 'test', shared_actions: [] };
            decodeCompressedNode.mockReturnValue(JSON.stringify(mockNodeData));
            
            const result = service.decodeCompressedNode(Buffer.from('compressed'));
            
            expect(decodeCompressedNode).toHaveBeenCalledWith(Buffer.from('compressed'));
            expect(result).toEqual(mockNodeData);
        });

        test('fetchAndDecodeNode should combine fetch and decode operations', async () => {
            const mockCompressedData = Buffer.from('compressed');
            const mockNodeData = { node_id: 'test', shared_actions: [] };
            
            s3Helper.getObject.mockResolvedValue({ Body: mockCompressedData });
            decodeCompressedNode.mockReturnValue(JSON.stringify(mockNodeData));
            
            const leanNodeMeta = { s3_key: 'test-key' };
            const result = await service.fetchAndDecodeNode(leanNodeMeta);
            
            expect(result).toEqual(mockNodeData);
        });
    });

    describe('Range Analysis Operations', () => {
        test('calculateRangeEquity should calculate equity between ranges', () => {
            const mockEquity = { oop_equity: 45.2, ip_equity: 54.8 };
            calculateRangeEquity.mockReturnValue(JSON.stringify(mockEquity));
            
            const result = service.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc'], 'oop');
            
            expect(calculateRangeEquity).toHaveBeenCalledWith('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc'], 'oop');
            expect(result).toEqual(mockEquity);
        });

        test('calculateRangeEquity should use default nextToAct', () => {
            calculateRangeEquity.mockReturnValue(JSON.stringify({}));
            
            service.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc']);
            
            expect(calculateRangeEquity).toHaveBeenCalledWith('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc'], 'oop');
        });

        test('calculateRangeEquity should handle errors', () => {
            calculateRangeEquity.mockImplementation(() => {
                throw new Error('NAPI error');
            });
            
            expect(() => service.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc']))
                .toThrow('Failed to calculate range equity: NAPI error');
        });
    });

    describe('Board Analysis Operations', () => {
        test('analyzeBoardTexture should analyze board texture', () => {
            const mockTexture = { 
                is_paired: false, 
                is_monotone: false, 
                texture_tags: ['high', 'connected'] 
            };
            analyzeBoardTextureApi.mockReturnValue(JSON.stringify(mockTexture));
            
            const result = service.analyzeBoardTexture(['Ah', 'Kd', 'Qc']);
            
            expect(analyzeBoardTextureApi).toHaveBeenCalledWith(['Ah', 'Kd', 'Qc']);
            expect(result).toEqual(mockTexture);
        });

        test('analyzeBoardTexture should handle errors', () => {
            analyzeBoardTextureApi.mockImplementation(() => {
                throw new Error('Invalid board');
            });
            
            expect(() => service.analyzeBoardTexture(['Invalid']))
                .toThrow('Failed to analyze board texture: Invalid board');
        });
    });

    describe('Hand Analysis Operations', () => {
        test('analyzeHandFeatures should analyze hand features', () => {
            const mockFeatures = {
                strength: 85.5,
                draws: ['straight_draw'],
                blockers: ['ace_blocker']
            };
            analyzeHandFeatures.mockReturnValue(JSON.stringify(mockFeatures));
            
            const result = service.analyzeHandFeatures('AhKh', 'QQ+,AK', ['Ad', 'Kd', 'Qc']);
            
            expect(analyzeHandFeatures).toHaveBeenCalledWith('AhKh', 'QQ+,AK', ['Ad', 'Kd', 'Qc']);
            expect(result).toEqual(mockFeatures);
        });
    });

    describe('Feature Vector Operations', () => {
        test('buildFeatureVector should build feature vector from snapshot', () => {
            const mockVector = [0.1, 0.2, 0.3, 0.4, 0.5];
            buildFeatureVector.mockReturnValue(mockVector);
            
            const snapshot = { street: 'FLOP', pot: 6.5 };
            const result = service.buildFeatureVector(snapshot);
            
            expect(buildFeatureVector).toHaveBeenCalledWith(JSON.stringify(snapshot));
            expect(result).toEqual(mockVector);
        });

        test('buildFeatureVector should handle string input', () => {
            const mockVector = [0.1, 0.2, 0.3];
            buildFeatureVector.mockReturnValue(mockVector);
            
            const snapshotJson = '{"street":"FLOP","pot":6.5}';
            const result = service.buildFeatureVector(snapshotJson);
            
            expect(buildFeatureVector).toHaveBeenCalledWith(snapshotJson);
            expect(result).toEqual(mockVector);
        });
    });

    describe('High-Level Granular Operations', () => {
        test('getEquityOnly should return only equity analysis', async () => {
            const mockEquity = { oop_equity: 45.2, ip_equity: 54.8 };
            calculateRangeEquity.mockReturnValue(JSON.stringify(mockEquity));
            
            const result = await service.getEquityOnly('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc'], 'oop');
            
            expect(result).toEqual(mockEquity);
        });

        test('getBoardAnalysisOnly should return only board analysis', async () => {
            const mockTexture = { is_paired: false, texture_tags: ['high'] };
            analyzeBoardTextureApi.mockReturnValue(JSON.stringify(mockTexture));
            
            const result = await service.getBoardAnalysisOnly(['Ah', 'Kd', 'Qc']);
            
            expect(result).toEqual(mockTexture);
        });

        test('getCustomAnalysis should run selected analyses', async () => {
            // Mock data for different analyses
            const mockEquity = { oop_equity: 45.2, ip_equity: 54.8 };
            const mockTexture = { is_paired: false, texture_tags: ['high'] };
            const mockBlocker = { combos_blocked_pct: 15.5 };
            
            calculateRangeEquity.mockReturnValue(JSON.stringify(mockEquity));
            analyzeBoardTextureApi.mockReturnValue(JSON.stringify(mockTexture));
            calculateBlockerImpactApi.mockReturnValue(JSON.stringify(mockBlocker));
            
            // Mock S3 fetch and decode for range advantage
            const mockNodeData = { node_id: 'test', shared_actions: [] };
            s3Helper.getObject.mockResolvedValue({ Body: Buffer.from('compressed') });
            decodeCompressedNode.mockReturnValue(JSON.stringify(mockNodeData));
            
            const leanNodeMeta = { s3_key: 'test-key' };
            const analysisOptions = {
                includeEquity: true,
                includeBoardTexture: true,
                includeBlockerAnalysis: true,
                includeRangeAdvantage: false, // Skip this to avoid additional mocking
                oopRange: 'AA:1.0',
                ipRange: 'KK:1.0',
                board: ['Ah', 'Kd', 'Qc'],
                heroHand: 'AhKh'
            };
            
            const result = await service.getCustomAnalysis(leanNodeMeta, analysisOptions);
            
            expect(result.equity).toEqual(mockEquity);
            expect(result.boardTexture).toEqual(mockTexture);
            expect(result.blockerImpact).toEqual(mockBlocker);
        });

        test('batchCalculateEquities should process multiple equity queries', async () => {
            const mockEquity1 = { oop_equity: 45.2, ip_equity: 54.8 };
            const mockEquity2 = { oop_equity: 38.7, ip_equity: 61.3 };
            
            calculateRangeEquity
                .mockReturnValueOnce(JSON.stringify(mockEquity1))
                .mockReturnValueOnce(JSON.stringify(mockEquity2));
            
            const queries = [
                { oopRange: 'AA:1.0', ipRange: 'KK:1.0', board: ['Ah', 'Kd', 'Qc'], nextToAct: 'oop' },
                { oopRange: 'AK:1.0', ipRange: 'QQ:1.0', board: ['2h', '3d', '4c'], nextToAct: 'ip' }
            ];
            
            const results = await service.batchCalculateEquities(queries);
            
            expect(results).toHaveLength(2);
            expect(results[0]).toEqual(mockEquity1);
            expect(results[1]).toEqual(mockEquity2);
        });
    });

    describe('Transform Operations', () => {
        test('transformToSolverBlock should transform node to solver block', () => {
            const mockSolverBlock = {
                nodeId: 'test',
                sim: 1.0,
                rangeAdvantage: { oop_equity: 45.2 }
            };
            transformCompactToSolverBlock.mockReturnValue(JSON.stringify(mockSolverBlock));
            
            const nodeData = { node_id: 'test', shared_actions: [] };
            const snapshot = { street: 'FLOP' };
            
            const result = service.transformToSolverBlock(nodeData, snapshot, 0.95, 'AhKh');
            
            expect(transformCompactToSolverBlock).toHaveBeenCalledWith(
                JSON.stringify(nodeData),
                JSON.stringify(snapshot),
                0.95,
                'AhKh'
            );
            expect(result).toEqual(mockSolverBlock);
        });
    });

    describe('Legacy Compatibility', () => {
        test('getUnpackedAndTransformedNode should work with legacy interface', async () => {
            const mockSolverBlock = {
                nodeId: 'test',
                rangeAdvantage: { oop_equity: 45.2 }
            };
            
            // Mock S3 fetch
            s3Helper.getObject.mockResolvedValue({ Body: Buffer.from('compressed') });
            
            // Mock feature vector building
            buildFeatureVector.mockReturnValue([0.1, 0.2, 0.3]);
            
            // Mock legacy NAPI function
            unpackAndTransformNode.mockReturnValue(JSON.stringify(mockSolverBlock));
            
            const leanNodeMeta = { s3_key: 'test-key' };
            const snapshotInput = { street: 'FLOP', pot: 6.5 };
            
            const result = await service.getUnpackedAndTransformedNode(
                leanNodeMeta, 
                snapshotInput, 
                0.95, 
                'AhKh'
            );
            
            expect(result).toEqual(mockSolverBlock);
            
            // Verify feature vector was padded to 512 dimensions
            const callArgs = unpackAndTransformNode.mock.calls[0];
            expect(callArgs[2]).toHaveLength(512); // queryVector512
        });
    });

    describe('Error Handling', () => {
        test('should handle NAPI binding errors gracefully', () => {
            calculateRangeEquity.mockImplementation(() => {
                throw new Error('Rust panic: invalid range format');
            });
            
            expect(() => service.calculateRangeEquity('INVALID', 'RANGE', ['Ah', 'Kd', 'Qc']))
                .toThrow('Failed to calculate range equity: Rust panic: invalid range format');
        });

        test('should handle S3 fetch errors', async () => {
            s3Helper.getObject.mockRejectedValue(new Error('S3 access denied'));
            
            const leanNodeMeta = { s3_key: 'test-key' };
            
            await expect(service.fetchCompressedNodeData(leanNodeMeta))
                .rejects.toThrow('Failed to fetch compressed node data: S3 access denied');
        });

        test('should handle JSON parsing errors', () => {
            calculateRangeEquity.mockReturnValue('invalid json {');
            
            expect(() => service.calculateRangeEquity('AA:1.0', 'KK:1.0', ['Ah', 'Kd', 'Qc']))
                .toThrow('Failed to calculate range equity');
        });
    });

    describe('Input Validation', () => {
        test('should validate required parameters', async () => {
            await expect(service.fetchCompressedNodeData(null))
                .rejects.toThrow('Invalid LeanNodeMeta: missing s3_key');
            
            await expect(service.fetchCompressedNodeData({}))
                .rejects.toThrow('Invalid LeanNodeMeta: missing s3_key');
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle typical workflow: fetch -> decode -> analyze', async () => {
            // Setup mocks for complete workflow
            const mockCompressedData = Buffer.from('compressed');
            const mockNodeData = { 
                node_id: 'test', 
                shared_actions: [],
                ranges: { oop: 'AA:1.0', ip: 'KK:1.0' }
            };
            const mockRangeAdvantage = { oop_equity: 45.2, ip_equity: 54.8 };
            
            s3Helper.getObject.mockResolvedValue({ Body: mockCompressedData });
            decodeCompressedNode.mockReturnValue(JSON.stringify(mockNodeData));
            // Mock the range advantage analysis that uses the decoded node
            service.analyzeRangeAdvantage = jest.fn().mockReturnValue(mockRangeAdvantage);
            
            const leanNodeMeta = { s3_key: 'test-key' };
            
            // Test complete workflow
            const compressedData = await service.fetchCompressedNodeData(leanNodeMeta);
            const nodeData = service.decodeCompressedNode(compressedData);
            const rangeAnalysis = service.analyzeRangeAdvantage(nodeData, 'oop');
            
            expect(compressedData).toBe(mockCompressedData);
            expect(nodeData).toEqual(mockNodeData);
            expect(rangeAnalysis).toEqual(mockRangeAdvantage);
        });
    });
});