#!/usr/bin/env node

/**
 * LLM Flow Integration Test
 * 
 * Comprehensive test script that validates the entire LLM pipeline:
 * 1. Hand selection and context
 * 2. Solver integration and enrichment  
 * 3. LLM processing and analysis
 * 4. Results validation and benchmarking
 */

require('dotenv').config();

// Set up global context for database access
require('../global');

// Import core services
const Solves = require('../db/collections/Solves');
const { generateSnapshots } = require('../utils/solver-snapshot-generator');
const SolverLLMService = require('../utils/SolverLLMService');

// Import test helpers
const { findRandomRiverHand } = require('./helpers/hand-selector');
const { Benchmark } = require('./helpers/benchmark');
const { Display } = require('./helpers/display');

class LLMFlowTester {
    constructor() {
        this.benchmark = new Benchmark();
        this.display = new Display();
        this.llmService = new SolverLLMService({
            defaultModel: 'openai',
            enableMetrics: true,
            enableFallback: true,
            temperature: 0.3
        });
        
        this.results = {
            hand: null,
            snapshots: [],
            enrichedSnapshots: [],
            llmAnalysis: null,
            performance: {},
            errors: []
        };
    }

    /**
     * Main test execution
     */
    async runTest() {
        try {
            this.display.header('🚀 Starting LLM Flow Integration Test');
            
            // Phase 1: Hand Selection & Context
            await this.runPhase1();
            
            // Phase 2: Solver Integration  
            await this.runPhase2();
            
            // Phase 2.5: Tag Generation & Token Analysis (NEW)
            await this.runPhase2_5();
            
            // Phase 3: LLM Pipeline
            await this.runPhase3();
            
            // Phase 4: Results & Benchmarking
            this.runPhase4();
            
            this.display.success('\n✅ LLM Flow Test Completed Successfully!');
            
        } catch (error) {
            this.display.error(`\n❌ Test Failed: ${error.message}`);
            console.error('Full error:', error);
            process.exit(1);
        }
    }

    /**
     * Phase 1: Hand Selection & Context
     */
    async runPhase1() {
        this.display.phase('📋 PHASE 1: Hand Selection & Context');
        
        this.benchmark.start('hand_selection');
        
        try {
            // Find random river hand
            this.results.hand = await findRandomRiverHand();
            
            if (!this.results.hand) {
                throw new Error('No suitable hands found in database');
            }
            
            const selectionTime = this.benchmark.end('hand_selection');
            
            // Display hand context
            this.displayHandContext(this.results.hand);
            
            // Generate basic snapshots
            this.benchmark.start('snapshot_generation');
            this.results.snapshots = generateSnapshots(this.results.hand);
            const snapshotTime = this.benchmark.end('snapshot_generation');
            
            this.display.metric('Hand Selection', `${selectionTime}ms`);
            this.display.metric('Snapshot Generation', `${snapshotTime}ms`);
            this.display.metric('Snapshots Created', this.results.snapshots.length);
            
        } catch (error) {
            this.results.errors.push({ phase: 'Phase 1', error: error.message });
            throw error;
        }
    }

    /**
     * Phase 2: Solver Integration
     */
    async runPhase2() {
        this.display.phase('\n⚡ PHASE 2: Solver Integration');
        
        this.benchmark.start('solver_enrichment');
        
        try {
            // Get enriched snapshots with solver data
            this.results.enrichedSnapshots = await Solves.prepareSnapshots(this.results.hand._id);
            
            const enrichmentTime = this.benchmark.end('solver_enrichment');
            
            // Analyze solver results
            const solverStats = this.analyzeSolverResults(this.results.enrichedSnapshots);
            
            this.display.metric('Solver Enrichment', `${enrichmentTime}ms`);
            this.display.metric('Enriched Snapshots', this.results.enrichedSnapshots.length);
            this.display.metric('Solver Matches', `${solverStats.matches}/${solverStats.total} (${solverStats.matchRate}%)`);
            this.display.metric('Average Similarity', solverStats.avgSimilarity);
            
            // Display solver insights
            this.displaySolverInsights(this.results.enrichedSnapshots);
            
        } catch (error) {
            this.results.errors.push({ phase: 'Phase 2', error: error.message });
            throw error;
        }
    }

    /**
     * Phase 2.5: Tag Generation & Token Analysis (NEW)
     */
    async runPhase2_5() {
        this.display.phase('\n🏷️  PHASE 2.5: Tag Generation & Token Analysis');
        
        this.benchmark.start('tag_analysis');
        
        try {
            // Analyze tag generation results
            const tagStats = this.analyzeTagGeneration(this.results.enrichedSnapshots);
            
            this.display.metric('Total Tags Generated', tagStats.totalTags);
            this.display.metric('Average Tags/Snapshot', tagStats.avgTagsPerSnapshot.toFixed(1));
            this.display.metric('Tag Categories Used', tagStats.categoriesUsed.join(', '));
            
            // Display tag distribution
            this.display.subsection('Tag Distribution:');
            Object.entries(tagStats.categoryDistribution).forEach(([category, count]) => {
                this.display.indent(`${category}: ${count} tags`);
            });
            
            // Token comparison analysis
            this.benchmark.start('token_comparison');
            const LLMPromptBuilder = require('../utils/LLMPromptBuilder');
            const promptBuilder = new LLMPromptBuilder({ useTagSystem: false });
            
            // Build handMeta using promptBuilder's method
            const handMeta = promptBuilder.formatHandMeta(this.results.hand);
            
            // Compare token usage
            const tokenComparison = promptBuilder.compareTokenUsage(handMeta, this.results.enrichedSnapshots);
            
            this.display.subsection('Token Usage Comparison:');
            this.display.metric('Legacy Approach', `${tokenComparison.legacy.tokens} tokens`);
            this.display.metric('Tag-Based Approach', `${tokenComparison.tagBased.tokens} tokens`);
            this.display.metric('Token Reduction', `${tokenComparison.reduction.percentage}% (${tokenComparison.reduction.tokensSaved} tokens saved)`);
            
            // Store results for later reference
            this.results.tagAnalysis = {
                tagStats,
                tokenComparison
            };
            
            const tokenComparisonTime = this.benchmark.end('token_comparison');
            const tagAnalysisTime = this.benchmark.end('tag_analysis');
            
            this.display.metric('Tag Analysis Time', `${tagAnalysisTime}ms`);
            this.display.metric('Token Comparison Time', `${tokenComparisonTime}ms`);
            
            // Display sample tags for first snapshot
            if (this.results.enrichedSnapshots[0]?.solverTags?.length > 0) {
                this.display.subsection('Sample Tags (First Snapshot):');
                this.results.enrichedSnapshots[0].solverTags.slice(0, 5).forEach(tag => {
                    this.display.indent(tag);
                });
            }
            
        } catch (error) {
            this.results.errors.push({ phase: 'Phase 2.5', error: error.message });
            console.error('Tag analysis error:', error);
            // Continue execution even if tag analysis fails
        }
    }

    /**
     * Analyze tag generation results
     */
    analyzeTagGeneration(enrichedSnapshots) {
        let totalTags = 0;
        const categoryDistribution = {};
        const categoriesSet = new Set();
        
        enrichedSnapshots.forEach(snapshot => {
            const tags = snapshot.solverTags || [];
            totalTags += tags.length;
            
            tags.forEach(tag => {
                const category = tag.split(':')[0].replace('[', '');
                categoriesSet.add(category);
                categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
            });
        });
        
        return {
            totalTags,
            avgTagsPerSnapshot: enrichedSnapshots.length > 0 ? totalTags / enrichedSnapshots.length : 0,
            categoriesUsed: Array.from(categoriesSet),
            categoryDistribution
        };
    }

    /**
     * Phase 3: LLM Pipeline
     */
    async runPhase3() {
        this.display.phase('\n🤖 PHASE 3: LLM Processing');
        
        this.benchmark.start('llm_processing');
        
        try {
            // Estimate cost before processing
            const costEstimate = this.llmService.estimateCost(this.results.enrichedSnapshots);
            
            this.display.metric('Estimated Tokens', costEstimate.estimatedTokens);
            this.display.metric('Estimated Cost', `$${costEstimate.estimatedCost}`);
            this.display.metric('Provider', costEstimate.provider);
            this.display.metric('Complexity Score', costEstimate.complexity);
            
            // Run LLM analysis
            this.results.llmAnalysis = await this.llmService.analyzeHand(
                this.results.enrichedSnapshots,
                this.results.hand,
            );
            
            const llmTime = this.benchmark.end('llm_processing');
            
            this.display.metric('LLM Processing', `${llmTime}ms`);
            
            // Get final metrics from service
            const metrics = this.llmService.getMetrics();
            this.display.metric('Actual Tokens', metrics.totalTokensUsed);
            this.display.metric('Actual Cost', `$${metrics.totalCost.toFixed(4)}`);
            
        } catch (error) {
            this.results.errors.push({ phase: 'Phase 3', error: error.message });
            throw error;
        }
    }

    /**
     * Phase 4: Results & Benchmarking
     */
    runPhase4() {
        this.display.phase('\n📊 PHASE 4: Results & Analysis');
        
        // Display analysis results
        this.displayAnalysisResults(this.results.llmAnalysis);
        
        // Display performance report
        this.displayPerformanceReport();
        
        // Display any errors or warnings
        if (this.results.errors.length > 0) {
            this.display.warning('\n⚠️ Issues Encountered:');
            this.results.errors.forEach(error => {
                this.display.bullet(`${error.phase}: ${error.error}`);
            });
        }
    }

    /**
     * Display hand context information
     */
    displayHandContext(hand) {
        this.display.section('Hand Context');
        
        const heroCards = hand.preflopSummary?.cards ? 
            `${hand.preflopSummary.cards.card1}${hand.preflopSummary.cards.card2}` : 
            'Unknown';
        
        const board = hand.board ? 
            `${hand.board.card1 || ''}${hand.board.card2 || ''}${hand.board.card3 || ''}${hand.board.card4 || ''}${hand.board.card5 || ''}`.trim() :
            'Unknown';
        
        this.display.bullet(`Hand ID: ${hand._id}`);
        this.display.bullet(`Hero Cards: ${heroCards} (${hand.info?.heroPos || 'Unknown'})`);
        this.display.bullet(`Board: ${board}`);
        this.display.bullet(`Effective Stack: ${hand.info?.effStack || 'Unknown'}BB`);
        this.display.bullet(`Pot Type: ${hand.info?.potType?.toUpperCase() || 'Unknown'}`);
        this.display.bullet(`Game Type: ${hand.header?.gametype || 'Unknown'}`);
        this.display.bullet(`Saw Streets: Flop(${hand.info?.sawFlop ? '✓' : '✗'}) Turn(${hand.info?.sawTurn ? '✓' : '✗'}) River(${hand.info?.sawRiver ? '✓' : '✗'})`);
    }

    /**
     * Analyze solver results
     */
    analyzeSolverResults(enrichedSnapshots) {
        const total = enrichedSnapshots.length;
        const matches = enrichedSnapshots.filter(s => s.solver !== null).length;
        const similarities = enrichedSnapshots
            .filter(s => s.solver?.sim !== undefined)
            .map(s => s.solver.sim);
        
        return {
            total,
            matches,
            matchRate: total > 0 ? Math.round((matches / total) * 100) : 0,
            avgSimilarity: similarities.length > 0 ? 
                (similarities.reduce((a, b) => a + b, 0) / similarities.length).toFixed(3) : 
                'N/A'
        };
    }

    /**
     * Display solver insights
     */
    displaySolverInsights(enrichedSnapshots) {
        this.display.section('Solver Insights');
        
        enrichedSnapshots.forEach((snapshot, index) => {
            if (!snapshot.solver) {
                this.display.bullet(`Snapshot ${index + 1} (${snapshot.snapshotInput?.street}): No solver data`);
                return;
            }
            
            const solver = snapshot.solver;
            const street = snapshot.snapshotInput?.street;
            const recommendedAction = solver.optimalStrategy?.recommendedAction?.action || 'Unknown';
            const evHero = solver.evHero !== undefined ? solver.evHero.toFixed(2) : 'N/A';
            const similarity = solver.sim !== undefined ? (solver.sim * 100).toFixed(1) + '%' : 'N/A';
            
            this.display.bullet(`Snapshot ${index + 1} (${street}): ${recommendedAction} | EV: ${evHero} | Sim: ${similarity}`);
        });
    }

    /**
     * Display analysis results
     */
    displayAnalysisResults(analysis) {
        this.display.section('LLM Analysis Results');
        
        this.display.bullet(`Headline: "${analysis.headline}"`);
        this.display.bullet(`TL;DR: "${analysis.tlDr}"`);
        this.display.bullet(`Hand Score: ${analysis.handScore}/100`);
        
        const mistakes = analysis.snapshots.filter(s => s.mistake !== null);
        this.display.bullet(`Mistakes Found: ${mistakes.length}`);
        
        this.display.bullet(`Street Comments: ${analysis.snapshots.length}/4`);
        
        // Show street comments with UI tags
        this.display.subsection('Street Comments:');
        analysis.snapshots.forEach((snapshot, index) => {
            if (snapshot.streetComment) {
                const street = this.results.enrichedSnapshots[index]?.snapshotInput?.street || `Snapshot ${index + 1}`;
                this.display.indent(`${street}: "${snapshot.streetComment}"`);
            }
        });
        
        // Show mistakes if any
        if (mistakes.length > 0) {
            this.display.subsection('Mistakes Identified:');
            mistakes.forEach((snapshot, index) => {
                const mistake = snapshot.mistake;
                const street = this.results.enrichedSnapshots[index]?.snapshotInput?.street || `Snapshot ${index + 1}`;
                this.display.indent(`${street}: ${mistake.text} (EV Loss: ${mistake.evLoss}BB, Severity: ${mistake.severity}/100)`);
            });
        }
    }

    /**
     * Display performance report
     */
    displayPerformanceReport() {
        this.display.section('Performance Report');
        
        const totalTime = this.benchmark.getTotalTime();
        this.display.bullet(`Total Execution Time: ${totalTime}ms`);
        
        const phases = this.benchmark.getAllPhases();
        phases.forEach(phase => {
            this.display.indent(`${phase.name}: ${phase.duration}ms (${phase.percentage.toFixed(1)}%)`);
        });
        
        // Memory usage
        const memUsage = process.memoryUsage();
        this.display.bullet(`Peak Memory Usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        
        // Tag generation summary
        if (this.results.tagAnalysis) {
            this.display.subsection('Tag Generation Summary:');
            this.display.indent(`Total Tags: ${this.results.tagAnalysis.tagStats.totalTags}`);
            this.display.indent(`Token Reduction: ${this.results.tagAnalysis.tokenComparison.reduction.percentage}%`);
            this.display.indent(`Tokens Saved: ${this.results.tagAnalysis.tokenComparison.reduction.tokensSaved}`);
        }
        
        // Provider usage
        const providerMetrics = this.llmService.getMetrics();
        if (Object.keys(providerMetrics.providerUsage).length > 0) {
            this.display.subsection('Provider Usage:');
            Object.entries(providerMetrics.providerUsage).forEach(([provider, usage]) => {
                this.display.indent(`${provider}: ${usage.requests} requests, ${usage.tokens} tokens`);
            });
        }
    }
}

/**
 * Main execution
 */
async function main() {
    // Validate environment
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  Warning: OPENAI_API_KEY not found. Some features may not work.');
    }
    
    const tester = new LLMFlowTester();
    await tester.runTest();
}

// Handle errors gracefully
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Run the test
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { LLMFlowTester };