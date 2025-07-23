/**
 * SolverBlockTrimmer.js
 * 
 * Trims SolverBlock data for LLM consumption to optimize token usage
 * while preserving essential information for analysis generation.
 */

class SolverBlockTrimmer {
    constructor() {
        // Configuration for field trimming based on LLM requirements
        this.LLM_FIELDS = {
            // Always include - core strategic data
            boardAnalysis: { textureTags: true },
            rangeAdvantage: true, // All subfields
            optimalStrategy: {
                recommendedAction: true,
                actionFrequencies: true // Will be filtered to freq > 0.05
            },
            evHero: true,
            
            // Include with limits - most relevant combos only
            heroRange: {
                totalCombos: true,
                categories: 'TOP_8' // By percentOfRange
            },
            villainRange: {
                totalCombos: true,
                categories: 'TOP_8'
            },
            
            // Conditional includes based on significance
            sim: 'IF_LOW', // Only if < 0.9
            blockerImpact: 'IF_SIGNIFICANT', // If blocking >20% value or >80% bluffs unblocked
            handFeatures: {
                madeTier: true,
                pairSubtype: true,
                drawFlags: true,
                equityVsRange: true
                // EXCLUDE: nextStreetAnalysis (too large)
            }
        };

        // Frequency threshold for action filtering
        this.ACTION_FREQUENCY_THRESHOLD = 0.05;
        
        // Top N categories to keep for ranges
        this.TOP_CATEGORIES_LIMIT = 5;
        
        // Blocker impact thresholds
        this.BLOCKER_VALUE_THRESHOLD = 0.20; // 20%
        this.BLOCKER_BLUFF_THRESHOLD = 0.80; // 80%
        
        // Simulation threshold
        this.SIM_THRESHOLD = 0.9;
    }

    /**
     * Main trimming function - converts full SolverBlock to LLM-optimized version
     * @param {Object} solverBlock - Full SolverBlock object
     * @returns {Object} Trimmed SolverBlock for LLM consumption
     */
    trimForLLM(solverBlock) {
        if (!solverBlock) return null;

        const trimmed = {};

        // Always include fields
        if (solverBlock.boardAnalysis) {
            trimmed.boardAnalysis = {
                textureTags: solverBlock.boardAnalysis.textureTags || []
            };
        }

        if (solverBlock.rangeAdvantage) {
            trimmed.rangeAdvantage = this.trimDecimalPlaces(solverBlock.rangeAdvantage, 1);
        }

        if (solverBlock.evHero !== undefined) {
            trimmed.evHero = this.trimDecimalPlaces(solverBlock.evHero, 1);
        }

        // Optimal strategy with filtered actions
        if (solverBlock.optimalStrategy) {
            trimmed.optimalStrategy = {
                recommendedAction: solverBlock.optimalStrategy.recommendedAction,
                actionFrequencies: this.trimDecimalPlaces(solverBlock.optimalStrategy.actionFrequencies, 1),
            };
        }

        // Range data with top categories only
        if (solverBlock.heroRange) {
            trimmed.heroRange = {
                totalCombos: solverBlock.heroRange.totalCombos
            };

            if (solverBlock.heroRange.categories) {
                trimmed.heroRange.categories = this.getTopCategories(
                    solverBlock.heroRange.categories, 
                    this.TOP_CATEGORIES_LIMIT
                );
            }
        }

        if (solverBlock.villainRange) {
            trimmed.villainRange = {
                totalCombos: solverBlock.villainRange.totalCombos
            };

            if (solverBlock.villainRange.categories) {
                trimmed.villainRange.categories = this.getTopCategories(
                    solverBlock.villainRange.categories,
                    this.TOP_CATEGORIES_LIMIT
                );
            }
        }

        // Hand features (excluding nextStreetAnalysis)
        if (solverBlock.handFeatures) {
            trimmed.handFeatures = this.trimHandFeatures(solverBlock.handFeatures);
        }

        // Conditional fields
        
        // Include sim only if low (indicates uncertainty)
        if (solverBlock.sim !== undefined && solverBlock.sim < this.SIM_THRESHOLD) {
            trimmed.sim = this.trimDecimalPlaces(solverBlock.sim, 1);
        }

        // Include blocker impact only if significant
        if (this.shouldIncludeBlockers(solverBlock)) {
            trimmed.blockerImpact = {
                topBlocked: solverBlock.blockerImpact?.topBlocked?.slice(0, 3) || []
            };
        }

        // Include combo strategy if available (NEW: combo-specific strategy data)
        if (solverBlock.comboStrategy) {
            trimmed.comboStrategy = {
                category: solverBlock.comboStrategy.category,
                madeTier: solverBlock.comboStrategy.madeTier,
                topActions: this.trimDecimalPlaces(solverBlock.comboStrategy.topActions?.slice(0, 2) || [], 1), // Top 2 actions
                recommendedAction: solverBlock.comboStrategy.recommendedAction,
                confidence: solverBlock.comboStrategy.confidence
            };
        }

        return trimmed;
    }

    /**
     * Round numbers to specified decimal places, handling objects and arrays recursively
     * @param {any} value - Value to process
     * @param {number} decimals - Number of decimal places
     * @returns {any} Value with numbers rounded to specified decimal places
     */
    trimDecimalPlaces(value, decimals = 1) {
        if (typeof value === 'number') {
            return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
        }
        if (Array.isArray(value)) {
            return value.map(item => this.trimDecimalPlaces(item, decimals));
        }
        if (value && typeof value === 'object') {
            const trimmed = {};
            for (const [key, val] of Object.entries(value)) {
                trimmed[key] = this.trimDecimalPlaces(val, decimals);
            }
            return trimmed;
        }
        return value;
    }

    /**
     * Get top N categories by percentOfRange
     * @param {Array} categories - Array of category objects using HandArchetype system
     * @param {number} limit - Maximum number of categories to return
     * @returns {Array} Top categories by percentOfRange with simplified format
     */
    getTopCategories(categories, limit) {
        if (!Array.isArray(categories)) return [];

        return categories
            .sort((a, b) => (b.percentOfRange || 0) - (a.percentOfRange || 0))
            .slice(0, limit)
            .map(cat => ({
                madeTier: cat.archetype?.madeTier || 'Unknown',
                drawTier: cat.archetype?.drawFlags.join(', '),
                percentOfRange: this.trimDecimalPlaces(cat.percentOfRange || 0, 1),
                // examples: (cat.combos || cat.hands || []).slice(0, 3),
                strategyActions: this.trimDecimalPlaces((cat.strategyActions || []).slice(0, 2), 1)
            }))
    }

    /**
     * Trim hand features to exclude large nextStreetAnalysis
     * @param {Object} handFeatures - Hand features object
     * @returns {Object} Trimmed hand features
     */
    trimHandFeatures(handFeatures) {
        const trimmed = {};

        // Include specific fields only
        const fieldsToInclude = ['madeTier', 'pairSubtype', 'drawFlags', 'equityVsRange', 'nextStreetSummary'];
        
        fieldsToInclude.forEach(field => {
            if (handFeatures[field] !== undefined) {
                trimmed[field] = this.trimDecimalPlaces(handFeatures[field], 1);
            }
        });

        return trimmed;
    }

    /**
     * Determine if blocker impact should be included based on significance
     * @param {Object} solverBlock - Full SolverBlock object
     * @returns {boolean} Whether to include blocker impact
     */
    shouldIncludeBlockers(solverBlock) {
        if (!solverBlock.blockerImpact) return false;

        const { valueBlockedPct, bluffsUnblockedPct } = solverBlock.blockerImpact;

        // Include if blocking significant value or unblocking significant bluffs
        return (valueBlockedPct && valueBlockedPct > this.BLOCKER_VALUE_THRESHOLD) ||
               (bluffsUnblockedPct && bluffsUnblockedPct > this.BLOCKER_BLUFF_THRESHOLD);
    }

    /**
     * Estimate token count for trimmed data (rough approximation)
     * @param {Object} trimmedBlock - Trimmed SolverBlock
     * @returns {number} Estimated token count
     */
    estimateTokenCount(trimmedBlock) {
        const jsonString = JSON.stringify(trimmedBlock);
        // Rough approximation: 1 token per 4 characters
        return Math.ceil(jsonString.length / 4);
    }

    /**
     * Get trimming statistics for analysis
     * @param {Object} originalBlock - Original SolverBlock
     * @param {Object} trimmedBlock - Trimmed SolverBlock
     * @returns {Object} Trimming statistics
     */
    getTrimmingStats(originalBlock, trimmedBlock) {
        const originalSize = JSON.stringify(originalBlock).length;
        const trimmedSize = JSON.stringify(trimmedBlock).length;
        const reduction = ((originalSize - trimmedSize) / originalSize * 100).toFixed(1);

        return {
            originalSize,
            trimmedSize,
            reductionPct: parseFloat(reduction),
            estimatedTokens: this.estimateTokenCount(trimmedBlock)
        };
    }

    /**
     * Validate that essential fields are present after trimming
     * @param {Object} trimmedBlock - Trimmed SolverBlock
     * @returns {Object} Validation result
     */
    validateTrimmed(trimmedBlock) {
        const essential = ['rangeAdvantage', 'optimalStrategy', 'evHero'];
        const missing = essential.filter(field => !trimmedBlock[field]);
        
        return {
            isValid: missing.length === 0,
            missingFields: missing,
            hasRangeData: !!(trimmedBlock.heroRange || trimmedBlock.villainRange),
            hasBoardAnalysis: !!trimmedBlock.boardAnalysis
        };
    }
}

module.exports = SolverBlockTrimmer;