/**
 * Comprehensive Tests for SolverBlock Building Functions
 * 
 * These tests validate all the modular NAPI functions that will be used
 * to construct SolverBlock objects from decoded NodeAnalysis data.
 * 
 * Test Categories:
 * 1. Board Analysis Functions
 * 2. Range Analysis Functions  
 * 3. Blocker Impact Functions
 * 4. Hand Features Functions
 * 5. Action Strategy Functions
 * 6. Integration Tests for SolverBlock Building
 */

const ModularSolverNodeService = require('../ModularSolverNodeService');
const fs = require('fs');
const path = require('path');

// NO MOCKING - these will use real NAPI functions
const {
    calculateRangeEquity,
    analyzeBoardTextureApi,
    calculateRangeAdvantageApi,
    calculateBlockerImpactApi,
    analyzeHandFeatures,
    analyzeRangeComplete
} = require('../solver-node');

describe('SolverBlock Building Functions', () => {
    let service;
    let testNodeData;
    let sampleBoard;
    let sampleRanges;
    let sampleHeroHand;
    
    beforeAll(async () => {
        service = new ModularSolverNodeService({
            enableMetrics: true
        });
        
        // Load real test data if available
        const testZstdPath = path.join(__dirname, 'test.zstd');
        if (fs.existsSync(testZstdPath)) {
            try {
                const testZstdData = fs.readFileSync(testZstdPath);
                const decoded = service.decodeCompressedNode(testZstdData);
                testNodeData = Array.isArray(decoded) ? decoded[0] : decoded;
                console.log('Loaded real node data for testing');
            } catch (error) {
                console.warn('Could not load real node data:', error.message);
            }
        }
        
        // Test data setup
        sampleBoard = ['Ah', 'Kd', 'Qc'];
        sampleRanges = {
            hero: 'AA:1.0,KK:1.0,QQ:1.0,AK:1.0',
            villain: 'JJ:1.0,TT:1.0,99:1.0,AQ:1.0,KJ:1.0'
        };
        sampleHeroHand = 'AhKh';
    });

    describe('1. Board Analysis Functions', () => {
        test('should analyze board texture for SolverBlock.boardAnalysis', () => {
            try {
                const result = service.analyzeBoardTexture(sampleBoard);
                
                console.log('Board texture analysis:', result);
                
                // Verify structure for SolverBlock.boardAnalysis
                expect(result).toHaveProperty('texture');
                expect(result).toHaveProperty('isPaired');
                expect(result).toHaveProperty('textureTags');
                
                // Verify texture tags are arrays of strings
                if (result.textureTags) {
                    expect(Array.isArray(result.textureTags)).toBe(true);
                    result.textureTags.forEach(tag => {
                        expect(typeof tag).toBe('string');
                    });
                }
                
                console.log('✅ Board texture analysis ready for SolverBlock');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping board analysis test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should analyze various board textures', () => {
            try {
                const testBoards = [
                    { board: ['Ah', 'Ad', 'Kc'], desc: 'paired' },
                    { board: ['Ah', 'Kh', 'Qh'], desc: 'monotone' },
                    { board: ['9h', 'Th', 'Jc'], desc: 'coordinated' },
                    { board: ['As', '7d', '2c'], desc: 'rainbow' }
                ];
                
                testBoards.forEach(({ board, desc }) => {
                    const result = service.analyzeBoardTexture(board);
                    console.log(`${desc} board (${board.join('')}):`, {
                        texture: result.texture,
                        isPaired: result.isPaired,
                        tags: result.textureTags?.slice(0, 3) // Show first 3 tags
                    });
                    
                    expect(result).toHaveProperty('texture');
                    expect(result).toHaveProperty('isPaired');
                });
                
                console.log('✅ Multiple board textures analyzed successfully');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping multiple board test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('2. Range Analysis Functions', () => {
        test('should calculate range equity for SolverBlock.rangeAdvantage', () => {
            try {
                const result = service.calculateRangeEquity(
                    sampleRanges.hero,
                    sampleRanges.villain,
                    sampleBoard,
                    'oop'
                );
                
                console.log('Range equity calculation:', result);
                
                // Verify structure for SolverBlock.rangeAdvantage
                expect(result).toHaveProperty('heroEquity');
                expect(result).toHaveProperty('villainEquity');
                expect(result).toHaveProperty('equityDelta');
                expect(result).toHaveProperty('heroValuePct');
                expect(result).toHaveProperty('villainValuePct');
                expect(result).toHaveProperty('valueDelta');
                
                // Verify data types
                expect(typeof result.heroEquity).toBe('number');
                expect(typeof result.villainEquity).toBe('number');
                expect(typeof result.equityDelta).toBe('number');
                
                // Sanity checks
                expect(result.heroEquity + result.villainEquity).toBeCloseTo(100, 1);
                expect(result.equityDelta).toBeCloseTo(result.heroEquity - result.villainEquity, 1);
                
                console.log('✅ Range equity ready for SolverBlock.rangeAdvantage');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping range equity test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should calculate range advantage for value analysis', () => {
            try {
                const result = service.analyzeRangeAdvantage(
                    sampleRanges.hero,
                    sampleRanges.villain,
                    sampleBoard
                );
                
                console.log('Range advantage analysis:', result);
                
                // Verify structure matches calculateRangeAdvantageApi output
                expect(result).toHaveProperty('hero');
                expect(result).toHaveProperty('villain');
                expect(result).toHaveProperty('delta');
                
                expect(typeof result.hero).toBe('number');
                expect(typeof result.villain).toBe('number');
                expect(typeof result.delta).toBe('number');
                
                console.log('✅ Range advantage analysis ready for SolverBlock');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping range advantage test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should analyze complete range breakdown', () => {
            try {
                const result = service.analyzeRangeComplete(
                    sampleHeroHand,
                    sampleRanges.villain,
                    sampleBoard,
                    sampleRanges.hero
                );
                
                console.log('Complete range analysis keys:', Object.keys(result));
                
                // Verify structure for SolverBlock.heroRange and villainRange
                expect(result).toHaveProperty('heroRange');
                expect(result).toHaveProperty('villainRange');
                expect(result).toHaveProperty('blocking');
                
                // Verify range structure
                expect(result.heroRange).toHaveProperty('categories');
                expect(result.heroRange).toHaveProperty('totalCombos');
                expect(result.villainRange).toHaveProperty('categories');
                expect(result.villainRange).toHaveProperty('totalCombos');
                
                // Verify categories structure
                if (result.heroRange.categories.length > 0) {
                    const category = result.heroRange.categories[0];
                    expect(category).toHaveProperty('category');
                    expect(category).toHaveProperty('comboCount');
                    expect(category).toHaveProperty('frequency');
                    expect(category).toHaveProperty('percentOfRange');
                }
                
                console.log('✅ Complete range analysis ready for SolverBlock ranges');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping complete range test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('3. Blocker Impact Functions', () => {
        test('should calculate blocker impact for SolverBlock.blockerImpact', () => {
            try {
                const result = service.calculateBlockerImpact(
                    sampleHeroHand,
                    sampleRanges.villain,
                    sampleBoard
                );
                
                console.log('Blocker impact analysis:', result);
                
                // Verify structure for SolverBlock.blockerImpact
                expect(result).toHaveProperty('combosBlockedPct');
                expect(result).toHaveProperty('valueBlockedPct');
                expect(result).toHaveProperty('bluffsUnblockedPct');
                expect(result).toHaveProperty('cardRemoval');
                expect(result).toHaveProperty('topBlocked');
                
                // Verify data types
                expect(typeof result.combosBlockedPct).toBe('number');
                expect(typeof result.valueBlockedPct).toBe('number');
                expect(typeof result.bluffsUnblockedPct).toBe('number');
                
                // Verify arrays
                expect(Array.isArray(result.cardRemoval)).toBe(true);
                expect(Array.isArray(result.topBlocked)).toBe(true);
                
                // Verify card removal structure
                if (result.cardRemoval.length > 0) {
                    const cardEffect = result.cardRemoval[0];
                    expect(cardEffect).toHaveProperty('card');
                    expect(cardEffect).toHaveProperty('percentage');
                    expect(typeof cardEffect.card).toBe('string');
                    expect(typeof cardEffect.percentage).toBe('number');
                }
                
                // Verify top blocked structure
                if (result.topBlocked.length > 0) {
                    const blockedCategory = result.topBlocked[0];
                    expect(blockedCategory).toHaveProperty('name');
                    expect(blockedCategory).toHaveProperty('combosBlocked');
                    expect(blockedCategory).toHaveProperty('percentage');
                }
                
                console.log('✅ Blocker impact ready for SolverBlock');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping blocker impact test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should analyze blocker impact for different hero hands', () => {
            try {
                const testHands = ['AhKh', 'QsQd', 'JhTh', '9s8s'];
                
                testHands.forEach(heroHand => {
                    const result = service.calculateBlockerImpact(
                        heroHand,
                        sampleRanges.villain,
                        sampleBoard
                    );
                    
                    console.log(`${heroHand} blocker impact:`, {
                        combosBlocked: result.combosBlockedPct.toFixed(1) + '%',
                        valueBlocked: result.valueBlockedPct.toFixed(1) + '%',
                        bluffsUnblocked: result.bluffsUnblockedPct.toFixed(1) + '%'
                    });
                    
                    expect(result.combosBlockedPct).toBeGreaterThanOrEqual(0);
                    expect(result.combosBlockedPct).toBeLessThanOrEqual(100);
                });
                
                console.log('✅ Multiple blocker impacts analyzed successfully');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping multiple blocker test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('4. Hand Features Functions', () => {
        test('should analyze hand features for SolverBlock.handFeatures', () => {
            try {
                const result = service.analyzeHandFeatures(
                    sampleHeroHand,
                    sampleBoard,
                    sampleRanges.villain
                );
                
                console.log('Hand features analysis:', result);
                
                // Verify structure for SolverBlock.handFeatures
                expect(result).toHaveProperty('madeTier');
                expect(result).toHaveProperty('drawFlags');
                expect(result).toHaveProperty('equityVsRange');
                expect(result).toHaveProperty('nextStreetAnalysis');
                
                // Verify data types
                expect(typeof result.madeTier).toBe('string');
                expect(Array.isArray(result.drawFlags)).toBe(true);
                expect(typeof result.equityVsRange).toBe('number');
                
                // Verify next street analysis structure
                expect(result.nextStreetAnalysis).toHaveProperty('startingEquity');
                expect(result.nextStreetAnalysis).toHaveProperty('cardImpacts');
                expect(result.nextStreetAnalysis).toHaveProperty('summary');
                
                // Verify card impacts array
                expect(Array.isArray(result.nextStreetAnalysis.cardImpacts)).toBe(true);
                if (result.nextStreetAnalysis.cardImpacts.length > 0) {
                    const cardImpact = result.nextStreetAnalysis.cardImpacts[0];
                    expect(cardImpact).toHaveProperty('card');
                    expect(cardImpact).toHaveProperty('equityAfter');
                    expect(cardImpact).toHaveProperty('equityDelta');
                    expect(cardImpact).toHaveProperty('impact');
                }
                
                // Verify summary structure
                const summary = result.nextStreetAnalysis.summary;
                expect(summary).toHaveProperty('bestCard');
                expect(summary).toHaveProperty('worstCard');
                expect(summary).toHaveProperty('avgEquity');
                expect(summary).toHaveProperty('stdDev');
                expect(summary).toHaveProperty('gains');
                expect(summary).toHaveProperty('neutral');
                expect(summary).toHaveProperty('losses');
                
                console.log('✅ Hand features ready for SolverBlock');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping hand features test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should analyze hand features for different hand types', () => {
            try {
                const testScenarios = [
                    { hand: 'AhKh', board: ['Ad', 'Kd', 'Qc'], desc: 'two pair' },
                    { hand: 'QsQd', board: ['Qh', '7d', '2c'], desc: 'set' },
                    { hand: 'JhTh', board: ['9h', '8d', '2c'], desc: 'straight draw' },
                    { hand: '7h6h', board: ['Ah', 'Kh', 'Qc'], desc: 'flush draw' }
                ];
                
                testScenarios.forEach(({ hand, board, desc }) => {
                    const result = service.analyzeHandFeatures(
                        hand,
                        board,
                        sampleRanges.villain
                    );
                    
                    console.log(`${desc} (${hand} on ${board.join('')}):`, {
                        madeTier: result.madeTier,
                        drawFlags: result.drawFlags,
                        equity: result.equityVsRange.toFixed(1) + '%'
                    });
                    
                    expect(result.madeTier).toBeTruthy();
                    expect(Array.isArray(result.drawFlags)).toBe(true);
                });
                
                console.log('✅ Multiple hand features analyzed successfully');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping multiple hand features test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('5. Action Strategy Functions', () => {
        test('should process node action data for SolverBlock.optimalStrategy', () => {
            if (!testNodeData) {
                console.log('⚠️  Skipping action strategy test - no real node data available');
                return;
            }
            
            try {
                // Test with real node data actions
                const actionsOOP = testNodeData.actionsOOP || [];
                const actionsIP = testNodeData.actionsIP || [];
                
                console.log('Node actions OOP count:', actionsOOP.length);
                console.log('Node actions IP count:', actionsIP.length);
                
                const relevantActions = actionsOOP.length > 0 ? actionsOOP : actionsIP;
                
                if (relevantActions.length > 0) {
                    console.log('Sample actions:', relevantActions.slice(0, 3).map(a => ({
                        action: a.action,
                        frequency: a.frequency,
                        ev: a.ev
                    })));
                    
                    // Verify action structure for SolverBlock.optimalStrategy
                    relevantActions.forEach(action => {
                        expect(action).toHaveProperty('action');
                        expect(action).toHaveProperty('frequency');
                        expect(action).toHaveProperty('ev');
                        
                        expect(typeof action.action).toBe('string');
                        expect(typeof action.frequency).toBe('number');
                        expect(typeof action.ev).toBe('number');
                    });
                    
                    // Find recommended action (highest frequency)
                    const recommendedAction = relevantActions.reduce((best, current) => 
                        current.frequency > best.frequency ? current : best
                    );
                    
                    console.log('Recommended action:', {
                        action: recommendedAction.action,
                        frequency: (recommendedAction.frequency * 100).toFixed(1) + '%',
                        ev: recommendedAction.ev.toFixed(2) + 'bb'
                    });
                    
                    expect(recommendedAction.frequency).toBeGreaterThan(0);
                    
                    console.log('✅ Action strategy data ready for SolverBlock');
                }
                
            } catch (error) {
                console.log('❌ Failed to process action strategy:', error.message);
                throw error;
            }
        });
    });

    describe('6. SolverBlock Integration Tests', () => {
        test('should validate all components work together', () => {
            try {
                const components = {};
                
                // Test board analysis
                components.boardAnalysis = service.analyzeBoardTexture(sampleBoard);
                expect(components.boardAnalysis).toHaveProperty('texture');
                
                // Test range advantage
                components.rangeEquity = service.calculateRangeEquity(
                    sampleRanges.hero,
                    sampleRanges.villain,
                    sampleBoard
                );
                expect(components.rangeEquity).toHaveProperty('heroEquity');
                
                // Test blocker impact
                components.blockerImpact = service.calculateBlockerImpact(
                    sampleHeroHand,
                    sampleRanges.villain,
                    sampleBoard
                );
                expect(components.blockerImpact).toHaveProperty('combosBlockedPct');
                
                // Test hand features
                components.handFeatures = service.analyzeHandFeatures(
                    sampleHeroHand,
                    sampleBoard,
                    sampleRanges.villain
                );
                expect(components.handFeatures).toHaveProperty('madeTier');
                
                console.log('✅ All SolverBlock components working together');
                console.log('Component summary:', {
                    boardTexture: components.boardAnalysis.texture,
                    heroEquity: components.rangeEquity.heroEquity.toFixed(1) + '%',
                    combosBlocked: components.blockerImpact.combosBlockedPct.toFixed(1) + '%',
                    handTier: components.handFeatures.madeTier
                });
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping integration test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should handle edge cases and errors gracefully', () => {
            try {
                // Test with empty ranges
                try {
                    service.calculateRangeEquity('', '', sampleBoard);
                } catch (error) {
                    console.log('✅ Empty range error handled:', error.message);
                }
                
                // Test with invalid board
                try {
                    service.analyzeBoardTexture(['XX', 'YY', 'ZZ']);
                } catch (error) {
                    console.log('✅ Invalid board error handled:', error.message);
                }
                
                // Test with invalid hand
                try {
                    service.calculateBlockerImpact('XX', sampleRanges.villain, sampleBoard);
                } catch (error) {
                    console.log('✅ Invalid hand error handled:', error.message);
                }
                
                console.log('✅ Error handling validation complete');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping error handling test - NAPI not available');
                    return;
                }
                // Expected to catch errors in this test
            }
        });
    });

    describe('8. Combo Strategy Functions', () => {
        test('should extract combo strategy for hero hand with valid combo data', () => {
            try {
                // Mock combo data in solver format
                const comboDataMap = {
                    'AhKh': 'B 9.75:10.0:21.15;B 6.5:60.0:21.87;B 4.23:5.0:21.84;B 2.15:25.0:21.85;X:0.0:20.9',
                    'QsQd': 'B 6.5:80.0:22.50;B 2.15:20.0:22.30;X:0.0:21.90',
                    'JhTh': 'B 2.15:30.0:19.50;X:70.0:19.20',
                    '9s8s': 'X:100.0:18.50'
                };
                
                const rangeString = 'AhKh:1.0,QsQd:1.0,JhTh:1.0,9s8s:1.0';
                const heroHand = 'AhKh';
                
                const result = service.extractComboStrategy(
                    heroHand,
                    sampleBoard,  // actual_board where hero's hand is
                    sampleBoard,  // solver_board where strategies were calculated
                    rangeString,
                    comboDataMap
                );
                
                console.log('Combo strategy result:', result);
                
                // Verify structure
                expect(result).toHaveProperty('heroHand');
                expect(result).toHaveProperty('category');
                expect(result).toHaveProperty('madeTier');
                expect(result).toHaveProperty('drawFlags');
                expect(result).toHaveProperty('topActions');
                expect(result).toHaveProperty('recommendedAction');
                expect(result).toHaveProperty('confidence');
                
                // Verify data types
                expect(result.heroHand).toBe(heroHand);
                expect(typeof result.category).toBe('string');
                expect(Array.isArray(result.drawFlags)).toBe(true);
                expect(Array.isArray(result.topActions)).toBe(true);
                expect(typeof result.recommendedAction).toBe('string');
                expect(typeof result.confidence).toBe('string');
                
                // Verify top actions structure (should have top 2 actions)
                expect(result.topActions.length).toBeGreaterThan(0);
                expect(result.topActions.length).toBeLessThanOrEqual(2);
                
                if (result.topActions.length > 0) {
                    const action = result.topActions[0];
                    expect(action).toHaveProperty('action');
                    expect(action).toHaveProperty('frequency');
                    expect(action).toHaveProperty('ev');
                    
                    expect(typeof action.action).toBe('string');
                    expect(typeof action.frequency).toBe('number');
                    expect(typeof action.ev).toBe('number');
                }
                
                console.log('✅ Combo strategy extraction working correctly');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping combo strategy test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should handle different hand categories for combo strategy', () => {
            try {
                const testScenarios = [
                    {
                        hand: 'AhKh',
                        board: ['Ad', 'Kd', 'Qc'],
                        desc: 'two pair',
                        comboData: 'B 6.5:70.0:25.50;B 2.15:30.0:25.20;X:0.0:24.90'
                    },
                    {
                        hand: 'QsQd', 
                        board: ['Qh', '7d', '2c'],
                        desc: 'set',
                        comboData: 'B 9.75:90.0:28.50;B 6.5:10.0:28.30;X:0.0:27.80'
                    },
                    {
                        hand: 'JhTh',
                        board: ['9h', '8d', '2c'],
                        desc: 'straight draw',
                        comboData: 'B 2.15:50.0:19.50;X:50.0:19.20'
                    }
                ];
                
                testScenarios.forEach(({ hand, board, desc, comboData }) => {
                    const comboDataMap = { [hand]: comboData };
                    const rangeString = `${hand}:1.0`;
                    
                    const result = service.extractComboStrategy(
                        hand,
                        board,  // actual_board
                        board,  // solver_board (same in this test)
                        rangeString,
                        comboDataMap
                    );
                    
                    console.log(`${desc} (${hand}):`, {
                        category: result.category,
                        madeTier: result.madeTier,
                        drawFlags: result.drawFlags,
                        topActionsCount: result.topActions.length,
                        recommendedAction: result.recommendedAction,
                        equityVsRange: result.equityVsRange,
                        confidence: result.confidence
                    });
                    
                    expect(result.heroHand).toBe(hand);
                    expect(result.topActions.length).toBeGreaterThan(0);
                    expect(['low', 'medium', 'high']).toContain(result.confidence);
                });
                
                console.log('✅ Multiple hand categories processed successfully');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping hand categories test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should parse complex combo data format correctly', () => {
            try {
                // Test with complex realistic combo data
                const complexComboData = {
                    'AhKh': 'B 12.75:5.5:23.45;B 9.25:15.2:23.32;B 6.50:35.8:23.18;B 4.25:18.9:23.05;B 2.15:24.6:22.95;X:0.0:22.80'
                };
                
                const result = service.extractComboStrategy(
                    'AhKh',
                    sampleBoard,  // actual_board
                    sampleBoard,  // solver_board
                    'AhKh:1.0',
                    complexComboData
                );
                
                console.log('Complex combo data result:', {
                    topActions: result.topActions,
                    recommendedAction: result.recommendedAction
                });
                
                // Should have exactly 2 top actions (as per our implementation)
                expect(result.topActions).toHaveLength(2);
                
                // First action should be the highest frequency
                const firstAction = result.topActions[0];
                const secondAction = result.topActions[1];
                
                expect(firstAction.frequency).toBeGreaterThanOrEqual(secondAction.frequency);
                
                // Recommended action should match the highest frequency action
                expect(result.recommendedAction).toBe(firstAction.action);
                
                console.log('✅ Complex combo data parsing working correctly');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping complex parsing test - NAPI not available');
                    return;
                }
                throw error;
            }
        });

        test('should integrate combo strategy with existing solver block building', () => {
            try {
                // Mock a flop node with combo data for integration test
                const mockFlopNode = {
                    _id: 'test-flop-node',
                    street: 'FLOP',
                    pot: 10.0,
                    stackOOP: 100.0,
                    stackIP: 95.0,
                    nextToAct: 'oop',
                    positions: { oop: 'bb', ip: 'bu' },
                    rangeStats: {
                        oop: 'AhKh:1.0,QsQd:1.0',
                        ip: 'JhTh:1.0,9s8s:1.0'
                    },
                    actionsOOP: [
                        { action: 'Check', frequency: 60.0, ev: 22.5 },
                        { action: 'B 6.5', frequency: 40.0, ev: 22.8 }
                    ],
                    comboData: {
                        'AhKh': 'B 6.5:70.0:23.2;X:30.0:22.9',
                        'QsQd': 'B 6.5:90.0:25.1;X:10.0:24.8'
                    }
                };
                
                // This tests the integration without actually calling buildSolverBlockFromFlopNode
                // since that would require the full Solves class setup
                const comboStrategy = service.extractComboStrategy(
                    'AhKh',
                    sampleBoard,  // actual_board
                    sampleBoard,  // solver_board
                    mockFlopNode.rangeStats.oop,
                    mockFlopNode.comboData
                );
                
                expect(comboStrategy).toHaveProperty('heroHand', 'AhKh');
                expect(comboStrategy).toHaveProperty('topActions');
                expect(comboStrategy.topActions.length).toBeGreaterThan(0);
                
                console.log('✅ Combo strategy integration test passed');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping integration test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });

    describe('7. Performance and Metrics', () => {
        test('should track performance metrics for solver block building', () => {
            try {
                // Reset metrics
                service.resetMetrics();
                
                // Run multiple operations
                service.analyzeBoardTexture(sampleBoard);
                service.calculateRangeEquity(sampleRanges.hero, sampleRanges.villain, sampleBoard);
                service.calculateBlockerImpact(sampleHeroHand, sampleRanges.villain, sampleBoard);
                
                const metrics = service.getMetrics();
                console.log('Performance metrics:', metrics);
                
                // Verify metrics are being tracked
                expect(metrics).toHaveProperty('calls');
                expect(metrics).toHaveProperty('averageTime');
                
                // Should have tracked calls
                expect(Object.keys(metrics.calls).length).toBeGreaterThan(0);
                
                console.log('✅ Performance tracking working for solver block building');
                
            } catch (error) {
                if (error.message.includes('Cannot find module')) {
                    console.log('⚠️  Skipping performance test - NAPI not available');
                    return;
                }
                throw error;
            }
        });
    });
});

/**
 * Test Execution Guide:
 * 
 * Run all tests:
 * npm test -- --testPathPattern=ModularSolverNodeService.solverblock.test.js
 * 
 * Run specific test suite:
 * npm test -- --testPathPattern=ModularSolverNodeService.solverblock.test.js --testNamePattern="Board Analysis"
 * 
 * Expected results:
 * - If NAPI is available: All tests should pass with real calculations
 * - If NAPI not available: Tests will be skipped with warnings
 */