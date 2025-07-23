#!/usr/bin/env node

/**
 * Preprocess hands for training data generation
 * 
 * This script:
 * 1. Fetches hands from database
 * 2. Enriches them with solver data and tags
 * 3. Saves to JSONL format for parallel processing
 */

require('dotenv').config();
require('../global');

const fs = require('fs').promises;
const path = require('path');
const Hands = require('../db/collections/Hands');
const Solves = require('../db/collections/Solves');
const { generateSnapshots } = require('../utils/solver-snapshot-generator');
const LLMPromptBuilder = require('../utils/LLMPromptBuilder');

// Trimmed system prompt for training data generation
const TRAINING_SYSTEM_PROMPT = `
You are an experienced poker coach explaining GTO concepts in everyday language but not so dumbed down, intermediate level.

TAG GLOSSARY:
[ACTION:*] - What to do and why
• CHECK - X, checking action (PROTECT_RANGE, TRAP, POT_CONTROL, WEAK, REALIZE_EQ)
• BET/RAISE - B/R with sizing (VALUE, BLUFF, SEMI_BLUFF, TURN_INTO_BLUFF, PROTECTION)
• CALL/FOLD - C/F decisions (POT_ODDS, BLUFF_CATCH)
• BETSIZE/RAISESIZE - SMALL/MEDIUM/LARGE/OVERBET with % of pot

[HAND:*] - Your hand strength
• TYPE: VALUE_PREMIUM (nuts), VALUE_MARGINAL (decent), DRAW_STRONG/WEAK, BLUFF_CATCHER, AIR
• ARCHETYPE: Specific hand (e.g., "Top Pair Good Kicker")
• FEATURES: MULTI_DRAW, BLOCKER_RELEVANT, VULNERABLE, REDRAW_POTENTIAL

[BOARD:*] - Board texture
• WETNESS: WET (many draws), SEMI_WET, DRY (few draws)
• TEXTURE: PAIRED, MONOTONE, CONNECTED
• NEXT_STREET: SWINGY vs STATIC, BEST/WORST cards

[RANGE:*] - Who's ahead
• ADVANTAGE: HERO_STRONG/SLIGHT, VILLAIN_STRONG/SLIGHT, NEUTRAL
• HERO/VILLAIN: POLARIZED (nuts+air), CONDENSED (medium), CAPPED (no nuts)

[BLOCKER:*] - Card removal
• What you block (VALUE/NUTS/BLUFFS/DRAWS) + examples like "AK,AQ"
• Context: GOOD_BLUFF, GOOD_BLUFFCATCH, TURN_TO_BLUFF

[SPR:*] - Stack depth (SHALLOW <2, MEDIUM 2-6, DEEP 6-13, VERY_DEEP >13)
[POTODDS:*] - Getting X:1, need Y% equity
[MIX:*] - Solver mixes (FREQ ratios, REASON why)
[POSITION:*] - IP (in position) or OOP (out of position)
[STRAT:*] - Strategic goals (EXTRACT_VALUE, DENY_EQUITY, LEVERAGE_NUTS)

TONE: 
Talk like a friend. Use "we", explain WHY solver does things, use slang (peel=call, barrel=bet, brick=blank). One tag per comment, woven naturally.

UI TAGS:
Use exactly these tags, one per comment at the end of each sentence: <range hero> <range villain> <mix> <blockers> <ev_duel> <board_texture> <pot_odds>

Your task: Read the hand data and generate natural coaching advice that translates these tags into explanations players can understand and apply

AVOID:
- Academic language ("equity realization", "range construction")
- Listing multiple concepts with commas
- Starting with "The solver says..."
- Explaining what happened (they know) - explain what to do
- Multiple tags per comment

OUTPUT FORMAT:
{
  "headline": "3-5 word punchy title",
  "tlDr": "One sentence capturing the key lesson in everyday language",
  "handScore": 0-100,
  "snapshots": [
    {
      "id": 0,
      "streetComment": "One flowing thought that sounds like natural poker table talk, with exactly one <ui_tag> woven seamlessly into the explanation",
      "mistake": null | { "text": "What went wrong explained simply", "evLoss": X.X, "severity": 0-100 }
    }
  ]
}`;

class HandPreprocessor {
    constructor(options = {}) {
        this.outputDir = options.outputDir || path.join(__dirname, '../training-data');
        this.handsPerShard = options.handsPerShard || 50;
        this.totalHands = options.totalHands || 500;
        this.promptBuilder = new LLMPromptBuilder({ useTagSystem: true });
    }

    async run() {
        console.log('🚀 Starting hand preprocessing...');
        
        // Ensure output directory exists
        await fs.mkdir(this.outputDir, { recursive: true });
        
        // Fetch hands
        console.log(`📋 Fetching ${this.totalHands} hands from database...`);
        const hands = await this.fetchHands();
        
        // Process hands
        console.log('⚡ Processing hands with solver data...');
        const processedHands = await this.processHands(hands);
        
        // Save master file
        const masterFile = path.join(this.outputDir, 'preprocessed_hands.jsonl');
        await this.saveToJsonl(processedHands, masterFile);
        console.log(`✅ Saved ${processedHands.length} hands to ${masterFile}`);
        
        // Create shards
        console.log('📂 Creating shards...');
        await this.createShards(processedHands);
        
        console.log('✨ Preprocessing complete!');
        return processedHands.length;
    }

    async fetchHands() {
        // Query for hands that:
        // 1. Have solver data
        // 2. Saw multiple streets
        // 3. Have hero cards
        const query = {
            'info.sawFlop': true,
            'preflopSummary.cards': { $exists: true },
            'info.heroPos': { $exists: true }
        };
        
        const hands = await Hands.findByQuery(query, { limit: this.totalHands })
        
        console.log(`Found ${hands.length} suitable hands`);
        return hands;
    }

    async processHands(hands) {
        const processedHands = [];
        let processed = 0;
        
        // Process hands in batches for concurrency
        const batchSize = 10;
        for (let i = 0; i < hands.length; i += batchSize) {
            const batch = hands.slice(i, i + batchSize);
            
            const batchResults = await Promise.all(
                batch.map(async (hand) => {
                    try {
                        // Get enriched snapshots with solver data
                        const enrichedSnapshots = await Solves.prepareSnapshots(hand._id);
                        
                        if (!enrichedSnapshots || enrichedSnapshots.length === 0) {
                            return null;
                        }
                        
                        // Filter snapshots that have solver tags
                        const snapshotsWithTags = enrichedSnapshots.filter(s => 
                            s.solverTags && s.solverTags.length > 0
                        );
                        
                        if (snapshotsWithTags.length === 0) {
                            return null;
                        }
                        
                        // Format hand metadata
                        const handMeta = this.promptBuilder.formatHandMeta(hand);
                        
                        // Consolidate action history like LLMPromptBuilder does
                        const actionHistory = this.promptBuilder.consolidateActionHistory(enrichedSnapshots);
                        
                        // Create processed entry in training format
                        return {
                            id: hand._id.toString(),
                            messages: [
                                {
                                    role: "system",
                                    content: TRAINING_SYSTEM_PROMPT
                                },
                                {
                                    role: "user", 
                                    content: JSON.stringify({
                                        handMeta,
                                        actionHistory, // Include the consolidated action history
                                        solverSnapshots: snapshotsWithTags.map(snapshot => ({
                                            street: snapshot.snapshotInput.street,
                                            board: snapshot.snapshotInput.board,
                                            potBB: snapshot.snapshotInput.pot_bb,
                                            heroAction: snapshot.decisionPoint?.heroAction?.action,
                                            solverTags: snapshot.solverTags,
                                            rangeAdvantage: snapshot.solver?.rangeAdvantage,
                                            recommendedAction: snapshot.solver?.optimalStrategy?.recommendedAction?.action
                                        }))
                                    })
                                }
                            ]
                        };
                    } catch (error) {
                        console.error(`Error processing hand ${hand._id}:`, error.message);
                        return null;
                    }
                })
            );
            
            // Add non-null results to processedHands
            batchResults.forEach(result => {
                if (result) {
                    processedHands.push(result);
                    processed++;
                }
            });
            
            console.log(`Processed ${processed}/${hands.length} hands...`);
        }
        
        return processedHands;
    }

    async saveToJsonl(data, filepath) {
        const lines = data.map(item => JSON.stringify(item));
        await fs.writeFile(filepath, lines.join('\n'));
    }

    async createShards(processedHands) {
        const numShards = Math.ceil(processedHands.length / this.handsPerShard);
        
        for (let i = 0; i < numShards; i++) {
            const start = i * this.handsPerShard;
            const end = Math.min(start + this.handsPerShard, processedHands.length);
            const shard = processedHands.slice(start, end);
            
            const shardFile = path.join(this.outputDir, `input_shard_${i + 1}.jsonl`);
            await this.saveToJsonl(shard, shardFile);
            
            console.log(`Created shard ${i + 1}: ${shard.length} hands (${shardFile})`);
        }
        
        // Create a manifest file
        const manifest = {
            totalHands: processedHands.length,
            numShards,
            handsPerShard: this.handsPerShard,
            shards: Array.from({ length: numShards }, (_, i) => ({
                id: i + 1,
                file: `input_shard_${i + 1}.jsonl`,
                handCount: Math.min(this.handsPerShard, processedHands.length - i * this.handsPerShard)
            }))
        };
        
        await fs.writeFile(
            path.join(this.outputDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );
    }
}

// Main execution
async function main() {
    const preprocessor = new HandPreprocessor({
        totalHands: 200,     // Total hands to process
        handsPerShard: 10    // Hands per shard (10 shards for 500 hands)
    });
    
    try {
        const count = await preprocessor.run();
        console.log(`\n✅ Successfully preprocessed ${count} hands!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Preprocessing failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = HandPreprocessor;