#!/usr/bin/env node

/**
 * Quick test script to validate tag generation
 */

require('dotenv').config();
require('../global');

const TagGenerationService = require('../utils/TagGenerationService');

// Sample solver block data for testing
const sampleSolverBlock = {
    nodeId: 'test-node-1',
    sim: 0.95,
    boardAnalysis: {
        textureTags: ['two-tone', 'connected']
    },
    rangeAdvantage: {
        heroEquity: 55,
        villainEquity: 45,
        equityDelta: 10,
        heroValuePct: 25,
        villainValuePct: 15,
        valueDelta: 10
    },
    heroRange: {
        totalCombos: 100,
        categories: {
            'top pair': { percentOfRange: 15 },
            'overpair': { percentOfRange: 5 },
            'flush draw': { percentOfRange: 12 },
            'air': { percentOfRange: 40 }
        }
    },
    villainRange: {
        totalCombos: 150,
        categories: {
            'top pair': { percentOfRange: 10 },
            'middle pair': { percentOfRange: 20 },
            'draws': { percentOfRange: 25 }
        }
    },
    blockerImpact: {
        combosBlockedPct: 12,
        valueBlockedPct: 22,
        bluffsUnblockedPct: 85,
        topBlocked: [
            { name: 'overpair', percentage: 25 },
            { name: 'top pair', percentage: 15 }
        ]
    },
    optimalStrategy: {
        recommendedAction: {
            action: 'Bet 6.5',
            ev: 4.2
        },
        actionFrequencies: [
            { action: 'Bet 6.5', frequency: 0.75, ev: 4.2 },
            { action: 'Check', frequency: 0.25, ev: 3.8 }
        ]
    },
    comboStrategy: {
        heroHand: 'AsKd',
        category: 'top pair',
        categoryName: 'Top Pair',
        madeTier: 'Pair',
        pairSubtype: 'TopPair',
        drawFlags: [],
        equityVsRange: 68,
        topActions: [
            { action: 'B 6.5', frequency: 75, ev: 4.2 },
            { action: 'Check', frequency: 25, ev: 3.8 }
        ],
        recommendedAction: 'B 6.5',
        confidence: 'high'
    },
    handFeatures: {
        madeTier: 'Pair',
        pairSubtype: 'TopPair',
        drawFlags: [],
        equityVsRange: 68,
        nextStreetAnalysis: {
            summary: {
                stdDev: 12,
                gains: 8,
                losses: 15,
                neutral: 23,
                bestCard: 'As',
                worstCard: '6h'
            }
        }
    }
};

const snapshotContext = {
    street: 'FLOP',
    potBB: 8.5,
    heroAction: { type: 'bet', amountBB: '6.5' }
};

console.log('🧪 Testing Tag Generation Service\n');

// Test with different priority levels
const priorities = ['concise', 'balanced', 'verbose'];

priorities.forEach(priority => {
    console.log(`\n📊 Testing with priority: ${priority}`);
    console.log('='.repeat(50));
    
    const tagService = new TagGenerationService({
        tagPriority: priority,
        enableReasoning: true,
        enableDebug: false
    });
    
    const tags = tagService.generateTags(sampleSolverBlock, snapshotContext);
    
    console.log(`Generated ${tags.length} tags:`);
    tags.forEach(tag => console.log(`  ${tag}`));
});

// Test token comparison
console.log('\n\n💰 Token Usage Analysis');
console.log('='.repeat(50));

const LLMPromptBuilder = require('../utils/LLMPromptBuilder');
const promptBuilder = new LLMPromptBuilder({ useTagSystem: true });

// Create sample snapshot with tags
const tagService = new TagGenerationService({ tagPriority: 'balanced' });
const generatedTags = tagService.generateTags(sampleSolverBlock, snapshotContext);

const sampleSnapshot = {
    snapshotInput: {
        street: 'FLOP',
        board: ['As', '7d', '3c'],
        pot_bb: 8.5,
        heroStackBB: 95,
        streetActionsHistory: {
            PREFLOP: ['SB posts 0.5', 'BB posts 1', 'BTN raises 3', 'SB folds', 'BB calls 2'],
            FLOP: ['BB checks', 'BTN bets 4.5']
        }
    },
    decisionPoint: {
        heroAction: {
            action: { type: 'bet', amountBB: '6.5' }
        }
    },
    solver: sampleSolverBlock,
    solverTags: generatedTags
};

const handMeta = {
    handId: 'test-123',
    effStackBB: 100,
    blinds: { sb: 0.5, bb: 1, ante: 0 },
    heroPos: 'BB',
    heroCards: ['As', 'Kd'],
    gameType: 'cash'
};

const tokenComparison = promptBuilder.compareTokenUsage(handMeta, [sampleSnapshot]);

console.log('\nLegacy Approach:');
console.log(`  Total tokens: ${tokenComparison.legacy.tokens}`);
console.log(`  User message length: ${tokenComparison.legacy.userMessageLength} chars`);

console.log('\nTag-Based Approach:');
console.log(`  Total tokens: ${tokenComparison.tagBased.tokens}`);
console.log(`  User message length: ${tokenComparison.tagBased.userMessageLength} chars`);
console.log(`  Tags generated: ${tokenComparison.tagBased.tagCount}`);

console.log('\nReduction:');
console.log(`  Percentage: ${tokenComparison.reduction.percentage}%`);
console.log(`  Tokens saved: ${tokenComparison.reduction.tokensSaved}`);

console.log('\n✅ Tag generation test complete!');