/**
 * LLMPromptBuilder.js
 * 
 * Constructs prompts for LLM analysis of poker hands with solver data.
 * Implements the single-shot architecture with UI tag system.
 */
const _ = require('lodash');

class LLMPromptBuilder {
    constructor(options = {}) {
        // Configuration options
        this.useTagSystem = options.useTagSystem !== false; // Default to true
        this.enableDebug = options.enableDebug || false;

        this.analysisPrompt = `
You are a poker meta-strategist. Your role is to analyze a series of strategic tags representing key moments in a poker hand and create a high-level "generation spec" for a poker coach AI.

Your goal is to identify the core strategic narrative and the most important teaching moments.

INPUT:
You will receive a JSON object containing hand metadata and an array of "solverTags" for each decision point (snapshot).

TASK:
1.  Review all solverTags across all snapshots.
2.  Identify the most critical, overarching strategic theme or lesson in the hand.
3.  Select the 3-5 most important tags that best illustrate this theme.
4.  Outline a clear narrative arc for how a coach should explain the hand.
5.  Specify a coaching tone.

OUTPUT FORMAT:
Return a single, clean JSON object with the following structure. Do not include any other text or explanations.
{
  "mainStrategicConcept": "The core lesson of the hand (e.g., 'Leveraging a range advantage on a wet board').",
  "keyFocusTags": ["An array of the 3-5 most important tags to focus on."],
  "narrativeArc": "A brief plan for the explanation (e.g., 'Start with pre-flop advantage, show how the wet board is a threat, then explain why the protective bet is correct.').",
  "tone": "A coaching tone (e.g., 'Direct and educational', 'Friendly and encouraging')."
}
`;
        
        // System prompt template
//         this.systemPrompt = `
// You are GTO Coach v2.

// GOALS
// - Give actionable street coaching.
// - Cite *why* using solver numbers (not just “solver says”).
// - Use at most 2 concise clauses (≤ ~28 words total).
// - Provide range composition comments if available

// DATA INTERPRETATION
// - You may compare equities: heroEquity > villainEquity by Xpp → "small edge".
// - Use textureTags: wet / connected / paired / high-card.
// - If evLoss >= 0.5 → mistake (severity scale below).
// - If |evLoss| < 0.05 → "indifferent" or "mix ok" (no mistake).
// - Add up to 2 bullets in "streetComment" explaining *why*
// + Bullet A: action & key number (freq, EV, equity delta).
// + Bullet B: *why* that number matters (range %, blockers, SPR).

// TONE
// - Helpful, Articulative, informative without drowning in numbers 

// TAG POLICY
// Allowed tags: <range hero> <range villain> <mix> <blockers> <ev_duel> <board_texture> <pot_odds>.
// Prefer tags listed in tagHints; use no more than 3 tags per comment.

// OUTPUT FORMAT:
// {
//   "headline": "3-5 word catchy title",
//   "tlDr": "One sentence summary",
//   "handScore": 0-100,
//   "snapshots": [
//     {
//       "id": 0,
//       "streetComment": "Text with <tags>",
//       "mistake": null | { "text": "...", "evLoss": X.X, "severity": 0-100 }
//     }
//   ]
// }`;
        this.systemPrompt = `
You are GTO Coach v2.

OVERVIEW MODE — GUIDELINES  
• Teach *why* a move is good/bad using strategic concepts.  
• Cite numbers ONLY via tags (<range hero>, …). No inline EVs unless critical.  
• Mention at most one concept per clause, two clauses max.
• Prefer these verbs: realise, deny, leverage, polarise, protect.  
• If confidence is "low", hedge with "often / sometimes".  

DATA INTERPRETATION
- You may compare equities: heroEquity > villainEquity by Xpp → "small edge".
- Use textureTags: wet / connected / paired / high-card.
- If evLoss >= 0.5 → mistake (severity scale below).
- If |evLoss| < 0.05 → "indifferent" or "mix ok" (no mistake).
- Add up to 2 bullets in "streetComment" explaining *why*
+ Bullet A: action & key number (freq, EV, equity delta).
+ Bullet B: *why* that number matters (range %, blockers, SPR).

COMBO STRATEGY DATA
- Each snapshot may include comboStrategy with hero's specific hand category strategy
- Use comboStrategy for precise statements: "With AQ (top-pair-top-kicker) solver bets quarter-pot 47% and checks 53%"
- Prefer comboStrategy over optimalStrategy when available for accuracy
- If comboStrategy confidence is "low", fall back to general optimalStrategy

TONE
- Helpful, Articulative, informative without drowning in numbers 

TAG POLICY
Allowed tags: <range hero> <range villain> <mix> <blockers> <ev_duel> <board_texture> <pot_odds>.
Prefer tags listed in tagHints; use no more than 3 tags per comment.
Use tags EXACTLY as <tag>. Do NOT add colons or percentages inside the angle brackets.
Always try to include at least 1 tag per streetComment.

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

        // Enhanced tag-aware system prompt
        this.tagSystemPrompt = `
You are a sharp, experienced poker coach who breaks down complex spots in a way that clicks instantly. You've seen it all and know how to explain GTO concepts through real-world language that players actually use at the table.
Use the generation spec supplied to generate your analysis of the hand, following its guides on tone, theme and ideas/strategic tags to focus on

INPUT:
You will receive a JSON object containing hand metadata and an array of "solverTags" for each decision point (snapshot).

SOLVER TRANSLATION:
Don't say "solver recommends" - explain WHY in natural language:
- "The solver likes a quarter-pot stab here - it lets us charge all those Q-T floats..."
- "Solver says keep the brakes on - checking keeps the pot manageable..."
- "Solver still folds half the time because their range is uncapped..."

KEY PHRASES THAT WORK:
- "own more [hand type]" instead of "have range advantage"
- "keep the pot tidy" instead of "pot control"
- "gifts them a free card" instead of "allows realization"
- "hit you with a barrel" instead of "bets"
- "peel" instead of "call"
- "brick" instead of "blank"
- "SPR under 2" instead of "shallow stacks"

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
[REASONING:*] - Deeper strategic interplay (e.g., [REASONING:RANGE:STRATEGY:OVERBET_POLARIZED_RANGE])

LANGUAGE PATTERNS TO USE:
- "We 3-bet pre, so..." (inclusive language)
- "Now they hit you with..." (direct, present tense)
- "Solver likes/hates..." (personify the solver)
- "That Ace is a mixed blessing..." (colloquial expressions)
- "You're getting 2.3:1" (natural ratios)
- "Their range is pretty chunky" (poker slang)
- "It's not a punt, but..." (acknowledge close spots)
- "Good discipline folding here" (reinforce good decisions)

NATURAL FLOW:
Each street comment should flow as ONE smooth thought that weaves in exactly ONE UI tag naturally. Don't list factors - connect them causally:
- "We 3-bet pre, so on J-9-K two-tone we actually own more sets and K-x than the button..."
- "That Ace helps their flatting range, but your J-T picks up the straight-flush draw, so..."
- "Pot-size from Villain is polar - mostly big value, rare bluffs..."

PLAN:
1.  Review all solverTags across all snapshots.
2.  Identify the most critical, overarching strategic theme or lesson in the hand.
3.  Select the 3-5 most important tags that best illustrate this theme.
4.  Outline a clear narrative arc for how a coach should explain the hand.
5.  Specify a coaching tone.

Using the plan you created, output hand narration in first person voice, like talking to a fellow poker player. Use poker-savvy languague but remain down to earth. Follow the plan concretely 

OUTPUT FORMAT:
{
  "plan": "{
    "mainStrategicConcept": "The core lesson of the hand (e.g., 'Leveraging a range advantage on a wet board').",
    "keyFocusTags": [{ street: "...", tags: ["Key 5-6 TAGs to focus on, MUST use supplied tags, do not invent something"] }],
    "narrativeArc": "A brief plan for the explanation (e.g., 'Start with pre-flop advantage, show how the wet board is a threat, then explain why the protective bet is correct.').",
    "tone": "A coaching tone (e.g., 'Direct and educational', 'Friendly and encouraging')."
   }",
  "headline": "3-5 word punchy title",
  "tlDr": "One sentence capturing the key lesson in everyday language",
  "handScore": 0-100,
  "snapshots": [
    {
      "id": 0,
      "streetComment": "2-3 sentecnes of flowing thought that sounds like natural poker table talk, with exactly one <ui_tag> woven seamlessly into the explanation",
      "mistake": null | { "text": "What went wrong explained simply", "evLoss": X.X, "severity": 0-100 }
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
     * @param {Object} generationSpec - Optional spec from the analysis phase
     * @returns {Object} Complete prompt with system and user messages
     */
    buildPrompt(handMeta, trimmedSnapshots, generationSpec = null) {
        // Check if we have tags in the snapshots
        const hasTags = trimmedSnapshots.some(s => s.solverTags && s.solverTags.length > 0);
        const shouldUseTags = this.useTagSystem && hasTags;
        
        const userMessage = shouldUseTags ? 
            this.buildTagBasedUserMessage(handMeta, trimmedSnapshots, generationSpec) :
            this.buildUserMessage(handMeta, trimmedSnapshots);
        
        return {
            system: shouldUseTags ? this.tagSystemPrompt : this.systemPrompt,
            user: JSON.stringify(userMessage) // Remove whitespace to reduce tokens
        };
    }

    /**
     * Build the prompt for the initial analysis phase.
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots with tags
     * @returns {Object} Prompt for the analysis LLM call
     */
    buildAnalysisPrompt(handMeta, trimmedSnapshots) {
        const userMessage = {
            handMeta,
            solverSnapshots: trimmedSnapshots.map((snapshot, index) => ({
                index,
                street: snapshot.snapshotInput.street,
                solverTags: snapshot.solverTags || []
            }))
        };

        return {
            system: this.analysisPrompt,
            user: JSON.stringify(userMessage)
        };
    }

    /**
     * Build tag-based user message (minimal solver data, using tags)
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots with tags
     * @param {Object} generationSpec - Optional spec from the analysis phase
     * @returns {Object} User message object with tags
     */
    buildTagBasedUserMessage(handMeta, trimmedSnapshots, generationSpec = null) {
        // Consolidate action history from all snapshots
        const actionHistory = this.consolidateActionHistory(trimmedSnapshots);
        
        const message = {
            handMeta,
            actionHistory, // Single consolidated action history for the entire hand
            solverSnapshots: trimmedSnapshots.map((snapshot, index) => {
                const { snapshotInput, decisionPoint, solverTags } = snapshot;
                const heroAction = _.pick(decisionPoint.heroAction.action, ['type', 'amount', 'amountBB']);

                // Build minimal snapshot with tags instead of full solver block
                return {
                    index,
                    street: snapshotInput.street,
                    board: snapshotInput.board || [],
                    potBB: snapshotInput.pot_bb,
                    heroStackBB: snapshotInput.heroStackBB,
                    heroAction: heroAction || null,
                    solverTags: solverTags || [],
                    // Include minimal solver data for mistake calculation
                    evHero: snapshot.solver?.evHero,
                    rangeAdvantage: snapshot.solver?.rangeAdvantage,
                    recommendedAction: snapshot.solver?.optimalStrategy?.recommendedAction?.action
                }
            })
        };

        if (generationSpec) {
            message.generationSpec = generationSpec;
        }

        return message;
    }

    /**
     * Build user message containing hand data and snapshots (legacy method)
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots with trimmed solver data
     * @returns {Object} User message object
     */
    buildUserMessage(handMeta, trimmedSnapshots) {
        // Consolidate action history from all snapshots
        const actionHistory = this.consolidateActionHistory(trimmedSnapshots);
        
        return {
            handMeta,
            actionHistory, // Single consolidated action history for the entire hand
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
                    solver: snapshot.solver
                }
            })
        };
    }

    /**
     * Consolidate action history from all snapshots into a single chronological sequence
     * @param {Array} trimmedSnapshots - Array of snapshots with streetActionsHistory
     * @returns {Array} Consolidated action history with decision markers and hero actions
     */
    consolidateActionHistory(trimmedSnapshots) {
        if (!trimmedSnapshots.length) return [];
        
        const consolidatedActions = [];
        const streets = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

        
        // Simple approach: build action history incrementally from each snapshot
        const addedActions = new Set();
        const heroActionsAlreadyShownInDecisions = new Set();
        
        trimmedSnapshots.forEach(snapshot => {
            const currentStreet = snapshot.snapshotInput.street;
            
            // Process all streets up to and including the current street
            for (const street of streets) {
                const streetHistory = snapshot.snapshotInput.streetActionsHistory[street];
                if (!streetHistory || streetHistory.length === 0) continue;
                
                // For the decision street, we need to handle the decision marker
                if (street === currentStreet) {
                    streetHistory.forEach((action, index) => {
                        if (action === '← decision') {
                            // Add the decision marker with hero's action
                            const heroAction = snapshot.decisionPoint?.heroAction?.action;
                            if (heroAction) {
                                const heroActionText = this.formatHeroAction(heroAction);
                                const decisionText = `← Decision (Hero ${heroActionText})`;
                                consolidatedActions.push(decisionText);
                                addedActions.add(decisionText);
                                
                                // Track this hero action to skip duplicates
                                // Need to match both "Hero check" and "Hero checks" formats
                                const baseAction = heroAction.type; // This is 'check', 'call', 'fold', etc.
                                heroActionsAlreadyShownInDecisions.add(`Hero ${baseAction}`);
                                heroActionsAlreadyShownInDecisions.add(`Hero ${heroActionText}`); // Also add the formatted version
                            }
                        } else {
                            // Skip hero actions that are already shown in decision markers
                            if (heroActionsAlreadyShownInDecisions.has(action)) {
                                return; // Skip this iteration in forEach
                            }
                            
                            // Add regular action if not already added
                            const actionKey = `${street}:${index}:${action}`;
                            if (!addedActions.has(actionKey)) {
                                consolidatedActions.push(action);
                                addedActions.add(actionKey);
                            }
                        }
                    });
                } else {
                    // For non-decision streets, just add actions we haven't seen
                    streetHistory.forEach((action, index) => {
                        if (action !== '← decision' && !heroActionsAlreadyShownInDecisions.has(action)) {
                            const actionKey = `${street}:${index}:${action}`;
                            if (!addedActions.has(actionKey)) {
                                consolidatedActions.push(action);
                                addedActions.add(actionKey);
                            }
                        }
                    });
                }
                
                // Stop processing streets after the current decision street
                if (street === currentStreet) break;
            }
        });
        
        return consolidatedActions;
    }
    
    /**
     * Format hero action for display in action history
     * @param {Object} heroAction - Hero action object
     * @returns {string} Formatted action string
     */
    formatHeroAction(heroAction) {
        const { type, amountBB } = heroAction;
        
        switch (type) {
            case 'check':
                return 'checks';
            case 'fold':
                return 'folds';
            case 'call':
                return 'calls';
            case 'bet':
                return amountBB ? `bets ${amountBB}BB` : 'bets';
            case 'raise':
                return amountBB ? `raises to ${amountBB}BB` : 'raises';
            default:
                return type || 'acts';
        }
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
     * Compare token usage between tag-based and legacy approaches
     * @param {Object} handMeta - Hand metadata
     * @param {Array} trimmedSnapshots - Array of snapshots
     * @returns {Object} Token comparison data
     */
    compareTokenUsage(handMeta, trimmedSnapshots) {
        // Build both versions
        const legacyPrompt = {
            system: this.systemPrompt,
            user: JSON.stringify(this.buildUserMessage(handMeta, trimmedSnapshots))
        };
        
        const tagPrompt = {
            system: this.tagSystemPrompt,
            user: JSON.stringify(this.buildTagBasedUserMessage(handMeta, trimmedSnapshots))
        };
        
        const legacyTokens = this.estimateTokens(legacyPrompt);
        const tagTokens = this.estimateTokens(tagPrompt);
        const reduction = ((legacyTokens - tagTokens) / legacyTokens * 100).toFixed(1);
        
        return {
            legacy: {
                tokens: legacyTokens,
                userMessageLength: legacyPrompt.user.length,
                systemPromptLength: legacyPrompt.system.length
            },
            tagBased: {
                tokens: tagTokens,
                userMessageLength: tagPrompt.user.length,
                systemPromptLength: tagPrompt.system.length,
                tagCount: trimmedSnapshots.reduce((sum, s) => sum + (s.solverTags?.length || 0), 0)
            },
            reduction: {
                percentage: reduction,
                tokensSaved: legacyTokens - tagTokens
            }
        };
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
