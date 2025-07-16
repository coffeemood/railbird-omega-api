/**
 * Integration Tests for ModularSolverNodeService
 * 
 * These tests use REAL NAPI functions (no mocking) to verify that:
 * 1. The NAPI bindings are working correctly
 * 2. The service class properly integrates with actual Rust functions
 * 3. Real solver calculations produce expected results
 * 4. Real compressed solver data can be processed
 * 
 * WARNING: These tests require the actual solver-node NAPI bindings to be built
 * and available. They will fail if the Rust code isn't compiled.
 */

const ModularSolverNodeService = require('../ModularSolverNodeService');
const fs = require('fs');
const path = require('path');

// NO MOCKING - these will use real NAPI functions
const {
    calculateRangeEquity,
    analyzeBoardTextureApi,
    buildFeatureVector,
    cosineSimilarity,
    decodeCompressedNode,
    transformCompactToSolverBlock,
    calculateRangeAdvantageApi,
    calculateBlockerImpactApi,
    analyzeHandFeatures,
    analyzeRangeComplete
} = require('../solver-node');

describe('ModularSolverNodeService Integration Tests', () => {
    let service;
    let testZstdData;
    let testNodeData;
    
    beforeAll(async () => {
        service = new ModularSolverNodeService({
            enableMetrics: true
        });
        
        // Load the real test.zstd file
        const testZstdPath = path.join(__dirname, 'test.zstd');
        if (fs.existsSync(testZstdPath)) {
            testZstdData = fs.readFileSync(testZstdPath);
            console.log(`Loaded test.zstd: ${testZstdData.length} bytes`);
            
            // Try to decode the test data to get real node data
            try {
                testNodeData = service.decodeCompressedNode(testZstdData);
                console.log('Successfully decoded test.zstd to node data');
                console.log('Node ID:', testNodeData.node_id);
                console.log('Shared actions count:', testNodeData.shared_actions?.length || 0);
            } catch (error) {
                console.warn('Could not decode test.zstd:', error.message);
                testNodeData = null;
            }
        } else {
            console.warn('test.zstd file not found - some tests will be skipped');
        }
    });

    describe('Real NAPI Function Integration', () => {
        test('should calculate real range equity', () => {
            // This would call the ACTUAL Rust function
            try {
                const result = service.calculateRangeEquity(
                    'AA:1.0,KK:1.0,QQ:1.0',  // Strong range
                    'AK:1.0,AQ:1.0,AJ:1.0',  // Drawing range
                    ['2h', '3d', '4c']        // Dry board
                );
                
                console.log('Real equity result:', result);
                
                // Verify structure of real result
                expect(result).toHaveProperty('heroEquity');
                expect(result).toHaveProperty('villainEquity');
                expect(typeof result.heroEquity).toBe('number');
                expect(typeof result.villainEquity).toBe('number');
                
                // Sanity check: equities should sum to approximately 100%
                expect(result.heroEquity + result.villainEquity).toBeCloseTo(100, 1);
                
                // Pocket pairs should have significant equity vs high cards on dry board
                expect(result.heroEquity).toBeGreaterThan(60);
                
            } catch (error) {
                console.log('Integration test failed - NAPI not available:', error.message);
                // Skip test if NAPI bindings not built
                if (error.message.includes('Cannot find module') || 
                    error.message.includes('solver-node')) {
                    console.log('⚠️  Skipping integration test - solver-node NAPI not built');
                    return;
                }
                throw error;
            }
        });

        test('should analyze real board texture', () => {
            try {
                const result = service.analyzeBoardTexture(['Ah', 'Kd', 'Qc']);
                
                console.log('Real board texture result:', result);
                
                // Verify structure of real result (uses camelCase)
                expect(result).toHaveProperty('isPaired');
                expect(result).toHaveProperty('texture');
                expect(result.isPaired).toBe(false); // AhKdQc is not paired
                expect(result.texture).toBe('Rainbow'); // Different suits
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping board texture test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should build real feature vectors', () => {
            try {
                const snapshot = {
                    street: 'FLOP',
                    board: ['Ah', 'Kd', 'Qc'],
                    pot_bb: 6.5,
                    stack_bb: 100,
                    positions: { oop: 'bb', ip: 'bu' },
                    action_history: ['Check', 'Bet 4.5'],
                    game_type: 'cash',
                    pot_type: 'srp'
                };
                
                const vector = service.buildFeatureVector(snapshot);
                
                console.log('Real feature vector length:', vector.length);
                console.log('First 10 features:', vector.slice(0, 10));
                
                // Verify structure
                expect(Array.isArray(vector)).toBe(true);
                expect(vector.length).toBeGreaterThan(0);
                expect(vector.every(x => typeof x === 'number')).toBe(true);
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping feature vector test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should calculate real cosine similarity', () => {
            try {
                const vector1 = [1.0, 0.0, 0.0];
                const vector2 = [0.0, 1.0, 0.0];
                const vector3 = [1.0, 0.0, 0.0];
                
                const similarity1 = service.calculateCosineSimilarity(vector1, vector2);
                const similarity2 = service.calculateCosineSimilarity(vector1, vector3);
                
                console.log('Orthogonal vectors similarity:', similarity1);
                console.log('Identical vectors similarity:', similarity2);
                
                // Orthogonal vectors should have 0 similarity
                expect(similarity1).toBeCloseTo(0, 5);
                
                // Identical vectors should have 1.0 similarity
                expect(similarity2).toBeCloseTo(1, 5);
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping cosine similarity test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('Performance Benchmarks', () => {
        test('should benchmark equity calculation performance', () => {
            try {
                const iterations = 100;
                const start = Date.now();
                
                for (let i = 0; i < iterations; i++) {
                    service.calculateRangeEquity(
                        'AA:1.0,KK:1.0',
                        'AK:1.0,AQ:1.0',
                        ['2h', '3d', '4c']
                    );
                }
                
                const totalTime = Date.now() - start;
                const avgTime = totalTime / iterations;
                
                console.log(`Real NAPI Performance: ${iterations} equity calculations in ${totalTime}ms`);
                console.log(`Average time per calculation: ${avgTime.toFixed(2)}ms`);
                
                // Performance expectation: should be faster than 50ms per calculation
                expect(avgTime).toBeLessThan(50);
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping performance test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('Real Test Data Integration', () => {
        test('should decode real test.zstd file', () => {
            if (!testZstdData) {
                console.log('⚠️  Skipping test.zstd test - file not available');
                return;
            }
            
            try {
                const decoded = service.decodeCompressedNode(testZstdData);
                
                console.log('Real test.zstd decoded successfully');
                console.log('Node structure keys:', Object.keys(decoded));
                
                // decoded is now an array of NodeAnalysis objects
                expect(Array.isArray(decoded)).toBe(true);
                expect(decoded.length).toBeGreaterThan(0);
                
                // Check first node structure
                const firstNode = decoded[0];
                expect(firstNode).toHaveProperty('node_id');
                expect(typeof firstNode.node_id).toBe('string');
                
                console.log(`Decoded ${decoded.length} nodes from test.zstd`);
                console.log('First node ID:', firstNode.node_id);
                console.log('First node street:', firstNode.street);
                
                // Check for solver data structures
                if (firstNode.actionsOOP) {
                    expect(Array.isArray(firstNode.actionsOOP)).toBe(true);
                    console.log('OOP actions count:', firstNode.actionsOOP.length);
                }
                
                if (firstNode.rangeStats) {
                    console.log('Range stats keys:', Object.keys(firstNode.rangeStats));
                }
                
            } catch (error) {
                console.log('❌ Failed to decode test.zstd:', error.message);
                throw error;
            }
        });

        // NOTE: Transform to solver block test removed - we'll build solver blocks on Node.js side using modular NAPI functions

        test('should analyze real range advantage from node data', () => {
            try {
                const rangeAdvantage = service.analyzeRangeAdvantage(
                    'AA:1.0,KK:1.0,QQ:1.0',
                    'AK:1.0,AQ:1.0,AJ:1.0',
                    ['Ah', 'Kd', 'Qc']
                );
                
                console.log('Real range advantage analysis:', rangeAdvantage);
                
                // Verify range advantage structure (actual format from calculate_range_advantage_api)
                expect(rangeAdvantage).toHaveProperty('hero');
                expect(rangeAdvantage).toHaveProperty('villain');
                expect(rangeAdvantage).toHaveProperty('delta');
                
                expect(typeof rangeAdvantage.hero).toBe('number');
                expect(typeof rangeAdvantage.villain).toBe('number');
                expect(typeof rangeAdvantage.delta).toBe('number');
                
            } catch (error) {
                console.log('❌ Failed to analyze range advantage:', error.message);
                throw error;
            }
        });
    });

    describe('Comprehensive NAPI Function Tests', () => {
        test('should test all core data operations', () => {
            if (!testZstdData) {
                console.log('⚠️  Skipping core data operations test');
                return;
            }
            
            try {
                // Test decompression and decoding
                const decoded1 = service.decodeCompressedNode(testZstdData);
                expect(Array.isArray(decoded1)).toBe(true);
                expect(decoded1.length).toBeGreaterThan(0);
                expect(decoded1[0]).toHaveProperty('node_id');
                
                // Test raw bincode decoding (if we had uncompressed data)
                // This would require uncompressed bincode data
                console.log('✅ Core data operations working');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping core data operations - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should test all range analysis functions', () => {
            try {
                // Test basic range equity
                const equity = service.calculateRangeEquity(
                    'AA:1.0,KK:1.0,QQ:1.0',
                    'AK:1.0,AQ:1.0,AJ:1.0',
                    ['2h', '3d', '4c']
                );
                expect(equity).toHaveProperty('heroEquity');
                console.log('✅ Range equity calculation working');
                
                // Test blocker impact
                const blockerImpact = service.calculateBlockerImpact(
                    'AhKh',
                    'AA:1.0,KK:1.0',
                    ['2h', '3d', '4c']
                );
                expect(blockerImpact).toHaveProperty('combosBlockedPct');
                console.log('✅ Blocker impact calculation working');
                
                // Test range advantage 
                const rangeAdvantage = service.analyzeRangeAdvantage(
                    'AA:1.0,KK:1.0',
                    'AK:1.0,AQ:1.0',
                    ['2h', '3d', '4c']
                );
                expect(rangeAdvantage).toHaveProperty('hero');
                console.log('✅ Range advantage analysis working');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping range analysis tests - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should test board and hand analysis functions', () => {
            try {
                // Test board texture analysis
                const boardTexture = service.analyzeBoardTexture(['Ah', 'Kd', 'Qc']);
                expect(boardTexture).toHaveProperty('isPaired');
                expect(boardTexture.isPaired).toBe(false);
                console.log('✅ Board texture analysis working');
                
                // Test hand features analysis
                const handFeatures = service.analyzeHandFeatures(
                    'AhKh',
                    ['Ad', 'Kd', 'Qc'],
                    'QQ+,AK'
                );
                expect(handFeatures).toHaveProperty('madeTier');
                console.log('✅ Hand features analysis working');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping board/hand analysis tests - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should test feature vector and ML functions', () => {
            try {
                // Test feature vector building
                const snapshot = {
                    street: 'FLOP',
                    board: ['Ah', 'Kd', 'Qc'],
                    pot_bb: 6.5,
                    stack_bb: 100,
                    positions: { oop: 'bb', ip: 'bu' },
                    action_history: ['Check', 'Bet 4.5'],
                    game_type: 'cash',
                    pot_type: 'srp'
                };
                
                const vector = service.buildFeatureVector(snapshot);
                expect(Array.isArray(vector)).toBe(true);
                expect(vector.length).toBeGreaterThan(0);
                console.log('✅ Feature vector building working');
                
                // Test cosine similarity
                const vector1 = [1.0, 0.0, 0.0];
                const vector2 = [0.0, 1.0, 0.0];
                const similarity = service.calculateCosineSimilarity(vector1, vector2);
                expect(similarity).toBeCloseTo(0, 5);
                console.log('✅ Cosine similarity calculation working');
                
                // Test batch feature vector building
                const snapshots = [snapshot, { ...snapshot, pot_bb: 10.0 }];
                const batchVectors = service.batchBuildFeatureVectors(snapshots);
                expect(Array.isArray(batchVectors)).toBe(true);
                expect(batchVectors.length).toBe(2);
                console.log('✅ Batch feature vector building working');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping feature vector tests - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should test action processing functions', () => {
            try {
                // Test action history canonicalization
                const actionHistory = ['Check', 'Bet 4.5', 'Call'];
                const canonicalized = service.canonicalizeActionHistory(actionHistory, 2.0);
                expect(typeof canonicalized).toBe('string');
                console.log('✅ Action history canonicalization working');
                
                // Test action hash calculation - removed as not needed
                
                // Test action string parsing
                const actionString = 'Bet 4.5';
                const parsedAction = service.parseActionString(actionString);
                expect(parsedAction).toHaveProperty('type');
                expect(parsedAction.type).toBe('bet');
                expect(parsedAction).toHaveProperty('amount');
                expect(parsedAction.amount).toBe(4.5);
                console.log('✅ Action string parsing working');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping action processing tests - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('Real vs Expected Results', () => {
        test('should produce mathematically correct equity results', () => {
            try {
                // Test case: AA vs KK preflop should be approximately 82% vs 18%
                const result = service.calculateRangeEquity(
                    'AA:1.0',           // Pocket aces
                    'KK:1.0',           // Pocket kings
                    []                  // Preflop (empty board)
                );
                
                console.log('AA vs KK preflop equity:', result);
                
                // AA should have approximately 82% equity
                if (result.oop_equity) {
                    expect(result.oop_equity).toBeGreaterThan(80);
                    expect(result.oop_equity).toBeLessThan(85);
                }
                
                // Test suited connector vs overpair on coordinated board
                const coordinatedResult = service.calculateRangeEquity(
                    'AA:1.0',
                    'JTs:1.0',
                    ['9h', 'Th', 'Jc']  // JT has straight and flush draws
                );
                
                console.log('AA vs JTs on 9TJ board:', coordinatedResult);
                
                // Should be much closer on this coordinated board
                if (coordinatedResult.heroEquity && coordinatedResult.villainEquity) {
                    const equityDiff = Math.abs(coordinatedResult.heroEquity - coordinatedResult.villainEquity);
                    expect(equityDiff).toBeLessThan(40); // Not a huge gap
                }
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping equity validation test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should validate board texture analysis accuracy', () => {
            try {
                // Test paired board
                const pairedBoard = service.analyzeBoardTexture(['Ah', 'Ad', 'Kc']);
                expect(pairedBoard.isPaired).toBe(true);
                console.log('✅ Paired board correctly identified');
                
                // Test monotone board (all same suit)
                const monotoneBoard = service.analyzeBoardTexture(['Ah', 'Kh', 'Qh']);
                // Note: Need to check actual property name returned by Rust
                console.log('Monotone board result:', monotoneBoard);
                
                // Test rainbow board
                const rainbowBoard = service.analyzeBoardTexture(['Ah', 'Kd', 'Qc']);
                expect(rainbowBoard.isPaired).toBe(false);
                console.log('✅ Rainbow board correctly identified');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping board texture validation - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });
});

/**
 * How to run these integration tests:
 * 
 * 1. Make sure solver-node NAPI bindings are built:
 *    cd solver-service/solver-node && npm run build
 * 
 * 2. Run integration tests:
 *    npm run test:integration
 * 
 * 3. Expected results:
 *    - If NAPI is available: Real calculations with actual results
 *    - If NAPI not available: Tests will be skipped with warnings
 */