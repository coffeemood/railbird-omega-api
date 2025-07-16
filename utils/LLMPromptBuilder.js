/**
 * LLMPromptBuilder.js
 * 
 * Constructs prompts for LLM analysis of poker hands with solver data.
 * Implements the single-shot architecture with UI tag system.
 */
const _ = require('lodash');

class LLMPromptBuilder {
    constructor() {
        // System prompt template
        this.systemPrompt = `You are GTO Coach v2, an expert poker analyst. Generate insightful, data-driven analysis using the provided solver data.

You are GTO Coach v2.

GOALS
- Give actionable street coaching.
- Cite *why* using solver numbers (not just “solver says”).
- Use at most 2 concise clauses (≤ ~28 words total).
- Provide range composition comments if available

DATA INTERPRETATION
- You may compare equities: heroEquity > villainEquity by Xpp → "small edge".
- Use textureTags: wet / connected / paired / high-card.
- If evLoss >= 0.5 → mistake (severity scale below).
- If |evLoss| < 0.05 → "indifferent" or "mix ok" (no mistake).
- Add up to 2 bullets in "streetComment" explaining *why*
+ Bullet A: action & key number (freq, EV, equity delta).
+ Bullet B: *why* that number matters (range %, blockers, SPR).

TAG POLICY
Allowed tags: <range hero> <range villain> <mix> <blockers> <ev_duel> <board_texture> <pot_odds>.
Prefer tags listed in tagHints; use no more than 3 tags per comment.

OUTPUT FORMAT:
{
  "headline": "3-5 word catchy title",
  "tlDr": "One sentence summary",
  "handScore": 0-100,
  "snapshots": [
    {
      "id": 0,
      "streetComment": "Text with <tags>",
      "mistake": null | { "text": "...", "evLoss": X.X, "severity": 0-100 }
    }
  ]
}`;

        // UI tag context mapping for validation
        this.tagContextMap = {
            '<range villain>': 'Use when discussing villain tendencies or range composition',
            '<range hero>': 'Use when explaining hero\'s range construction',
            '<mix>': 'Use when solver has mixed strategy (multiple actions >5%)',
            '<blockers>': 'Use when blocker effects are significant (>20%)',
            '<ev_duel>': 'Use when comparing hero action to optimal',
            '<board_texture>': 'Use when board characteristics affect strategy',
            '<pot_odds>': 'Use when pot odds drive the decision'
        };

        // Available tags with their properties
        this.availableTags = [
            { tag: '<range villain>', purpose: 'Show villain\'s range breakdown', inlineRenderable: false, pillNumber: 1 },
            { tag: '<range hero>', purpose: 'Show hero\'s range breakdown', inlineRenderable: false, pillNumber: 2 },
            { tag: '<mix>', purpose: 'Show solver\'s mixed strategy', inlineRenderable: true, pillNumber: 3 },
            { tag: '<blockers>', purpose: 'Show blocker impact', inlineRenderable: true, pillNumber: 4 },
            { tag: '<ev_duel>', purpose: 'Compare action EVs', inlineRenderable: true, pillNumber: 5 },
            { tag: '<board_texture>', purpose: 'Board analysis tooltip', inlineRenderable: true, pillNumber: 6 },
            { tag: '<pot_odds>', purpose: 'Pot odds calculation', inlineRenderable: true, pillNumber: 7 }
        ];
    }

    /**
     * Build complete prompt for LLM analysis
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots with trimmed solver data
     * @returns {Object} Complete prompt with system and user messages
     */
    buildPrompt(handMeta, trimmedSnapshots) {
        const userMessage = this.buildUserMessage(handMeta, trimmedSnapshots);
        
        return {
            system: this.systemPrompt,
            user: JSON.stringify(userMessage) // Remove whitespace to reduce tokens
        };
    }

    /**
     * Build user message containing hand data and snapshots
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots with trimmed solver data
     * @returns {Object} User message object
     */
    buildUserMessage(handMeta, trimmedSnapshots) {
        return {
            handMeta,
            solverSnapshots: trimmedSnapshots.map((snapshot, index) => {
                const { snapshotInput, decisionPoint } = snapshot;
                const heroAction = _.pick(decisionPoint.heroAction.action, ['type', 'amount', 'amountBB']);

                return {
                    index,
                    street: snapshotInput.street,
                    board: snapshotInput.board || [],
                    potBB: snapshotInput.pot_bb,
                    heroStackBB: snapshotInput.heroStackBB,
                    heroAction: heroAction || null,
                    streetActionsHistory: snapshotInput.streetActionsHistory,
                    solver: snapshot.solver
                }
            })
        };
    }

    /**
     * Format hand metadata for LLM consumption
     * @param {Object} handData - Raw hand data
     * @returns {Object} Formatted hand metadata
     */
    formatHandMeta(handData) {
        // Extract hero cards from preflopSummary or players array
        const heroCards = this.extractHeroCards(handData);
        
        return {
            handId: handData._id || handData.handId,
            effStackBB: handData.info?.effStack || this.calculateEffectiveStack(handData),
            blinds: {
                sb: handData.header?.sb ? handData.header.sb / handData.header.bb : 0.5,
                bb: 1, // Normalize to 1BB
                ante: handData.header?.ante ? handData.header.ante / handData.header.bb : 0
            },
            heroPos: handData.info?.heroPos || handData.preflopSummary?.pos || 'Unknown',
            heroCards: heroCards,
            gameType: handData.header?.gametype || 'cash'
        };
    }

    /**
     * Extract hero cards from hand data
     * @param {Object} handData - Hand data
     * @returns {Array} Hero cards [card1, card2]
     */
    extractHeroCards(handData) {
        // Try preflopSummary first
        if (handData.preflopSummary?.cards) {
            const { card1, card2 } = handData.preflopSummary.cards;
            return [card1, card2];
        }
        
        // Try to find hero in players array
        const heroPlayer = handData.players?.find(p => p.cards && 
            handData.playerChips?.find(pc => pc.name === p.name && pc.hero === true));
        
        if (heroPlayer?.cards) {
            const { card1, card2 } = heroPlayer.cards;
            return [card1, card2];
        }
        
        return [];
    }

    /**
     * Calculate effective stack size in BB
     * @param {Object} handData - Hand data
     * @returns {number} Effective stack in BB
     */
    calculateEffectiveStack(handData) {
        if (handData.info?.effStack) return handData.info.effStack;
        
        // Use playerChips to find smallest relevant stack
        if (handData.playerChips) {
            const activePlayers = handData.playerChips.filter(p => 
                handData.info?.sawFlop ? true : p.winLoss !== -handData.header?.ante || 0);
            
            if (activePlayers.length >= 2) {
                const stacks = activePlayers.map(p => p.bb);
                return Math.min(...stacks);
            }
        }
        
        return 100; // Default assumption
    }

    /**
     * Validate and suggest UI tags based on solver data
     * @param {Object} solverBlock - Trimmed solver block
     * @returns {Array} Suggested tags with context
     */
    suggestTags(solverBlock) {
        const suggestions = [];

        // Suggest range tags if range data exists
        if (solverBlock.heroRange) {
            suggestions.push({
                tag: '<range hero>',
                context: 'Hero range data available for analysis',
                data: solverBlock.heroRange
            });
        }

        if (solverBlock.villainRange) {
            suggestions.push({
                tag: '<range villain>',
                context: 'Villain range data available for analysis',
                data: solverBlock.villainRange
            });
        }

        // Suggest mix tag if multiple significant actions
        if (solverBlock.optimalStrategy?.actionFrequencies) {
            const significantActions = Object.values(solverBlock.optimalStrategy.actionFrequencies)
                .filter(freq => freq > 0.05).length;
            
            if (significantActions > 1) {
                suggestions.push({
                    tag: '<mix>',
                    context: 'Multiple significant actions suggest mixed strategy',
                    data: solverBlock.optimalStrategy.actionFrequencies
                });
            }
        }

        // Suggest blockers tag if blocker impact exists
        if (solverBlock.blockerImpact) {
            suggestions.push({
                tag: '<blockers>',
                context: 'Significant blocker effects detected',
                data: solverBlock.blockerImpact
            });
        }

        // Suggest ev_duel if comparing actions
        if (solverBlock.evHero !== undefined && solverBlock.optimalStrategy?.recommendedAction) {
            suggestions.push({
                tag: '<ev_duel>',
                context: 'EV comparison available between actions',
                data: { heroEV: solverBlock.evHero }
            });
        }

        // Suggest board_texture if board analysis exists
        if (solverBlock.boardAnalysis?.textureTags?.length > 0) {
            suggestions.push({
                tag: '<board_texture>',
                context: 'Board texture analysis available',
                data: solverBlock.boardAnalysis
            });
        }

        return suggestions;
    }

    /**
     * Extract pot odds calculation for pot_odds tag
     * @param {number} potBB - Pot size in BB
     * @param {number} betBB - Bet size in BB
     * @returns {Object} Pot odds data
     */
    calculatePotOdds(potBB, betBB) {
        if (!potBB || !betBB) return null;

        const totalPot = potBB + betBB;
        const oddsRatio = totalPot / betBB;
        const equityNeeded = betBB / totalPot;

        return {
            ratio: `${oddsRatio.toFixed(1)}:1`,
            equityNeeded: (equityNeeded * 100).toFixed(1) + '%',
            potSize: potBB,
            betSize: betBB
        };
    }

    /**
     * Validate prompt structure and content
     * @param {Object} prompt - Built prompt object
     * @returns {Object} Validation result
     */
    validatePrompt(prompt) {
        const issues = [];

        // Check system prompt
        if (!prompt.system || prompt.system.length < 100) {
            issues.push('System prompt missing or too short');
        }

        // Check user message
        if (!prompt.user) {
            issues.push('User message missing');
        }

        try {
            const userObj = JSON.parse(prompt.user);
            
            if (!userObj.handMeta) {
                issues.push('Hand metadata missing');
            }

            if (!userObj.solverSnapshots || !Array.isArray(userObj.solverSnapshots)) {
                issues.push('Solver snapshots missing or invalid');
            }

            // Check for required hand meta fields
            const requiredFields = ['handId', 'effStackBB', 'blinds', 'heroPos'];
            requiredFields.forEach(field => {
                if (!userObj.handMeta[field]) {
                    issues.push(`Missing required field: ${field}`);
                }
            });

        } catch (error) {
            issues.push('Invalid JSON in user message');
        }

        return {
            isValid: issues.length === 0,
            issues,
            estimatedTokens: this.estimateTokens(prompt)
        };
    }

    /**
     * Estimate token count for the complete prompt
     * @param {Object} prompt - Built prompt object
     * @returns {number} Estimated token count
     */
    estimateTokens(prompt) {
        const systemTokens = Math.ceil(prompt.system.length / 4);
        const userTokens = Math.ceil(prompt.user.length / 4);
        const expectedResponseTokens = 300; // Estimated response size

        return systemTokens + userTokens + expectedResponseTokens;
    }

    /**
     * Generate tag usage guidelines for reference
     * @returns {Object} Tag usage guidelines
     */
    getTagGuidelines() {
        return {
            guidelines: this.tagContextMap,
            availableTags: this.availableTags,
            bestPractices: [
                'Use tags to reference specific data points',
                'Keep comments under 20 words with tags',
                'Prefer inline-renderable tags when possible',
                'Reference quantitative data through tags',
                'Use tags to make comments interactive'
            ]
        };
    }

    /**
     * Build debug prompt for testing
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots
     * @returns {Object} Debug version of prompt with extra validation
     */
    buildDebugPrompt(handMeta, trimmedSnapshots) {
        const prompt = this.buildPrompt(handMeta, trimmedSnapshots);
        const validation = this.validatePrompt(prompt);
        
        // Add suggestions for each snapshot
        const suggestions = trimmedSnapshots.map(snapshot => ({
            snapshotId: snapshot.id || 0,
            suggestedTags: this.suggestTags(snapshot.solver || {}),
            potOdds: snapshot.heroAction && snapshot.potBB ? 
                this.calculatePotOdds(snapshot.potBB, this.extractBetSize(snapshot.heroAction)) : null
        }));

        return {
            prompt,
            validation,
            tagSuggestions: suggestions,
            guidelines: this.getTagGuidelines()
        };
    }

    /**
     * Extract bet size from hero action string
     * @param {string} heroAction - Hero action (e.g., "Bet 4.5BB")
     * @returns {number|null} Bet size in BB
     */
    extractBetSize(heroAction) {
        if (!heroAction) return null;
        
        const match = heroAction.match(/(\d+(?:\.\d+)?)\s*BB?/i);
        return match ? parseFloat(match[1]) : null;
    }
}

module.exports = LLMPromptBuilder;