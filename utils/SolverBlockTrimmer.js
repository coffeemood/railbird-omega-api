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
            trimmed.rangeAdvantage = solverBlock.rangeAdvantage;
        }

        if (solverBlock.evHero !== undefined) {
            trimmed.evHero = solverBlock.evHero;
        }

        // Optimal strategy with filtered actions
        if (solverBlock.optimalStrategy) {
            trimmed.optimalStrategy = {
                recommendedAction: solverBlock.optimalStrategy.recommendedAction,
                actionFrequencies: solverBlock.optimalStrategy.actionFrequencies,
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
            trimmed.sim = solverBlock.sim;
        }

        // Include blocker impact only if significant
        if (this.shouldIncludeBlockers(solverBlock)) {
            trimmed.blockerImpact = {
                topBlocked: solverBlock.blockerImpact?.topBlocked?.slice(0, 3) || []
            };
        }

        return trimmed;
    }

    /**
     * Get top N categories by percentOfRange
     * @param {Array} categories - Array of category objects
     * @param {number} limit - Maximum number of categories to return
     * @returns {Array} Top categories by percentOfRange
     */
    getTopCategories(categories, limit) {
        if (!Array.isArray(categories)) return [];

        return categories
            .sort((a, b) => (b.percentOfRange || 0) - (a.percentOfRange || 0))
            .slice(0, limit)
            .map(cat => ({
                name: cat.category,
                percentOfRange: cat.percentOfRange.toFixed(2),
                examples: cat.hands.slice(0, 3),
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
        const fieldsToInclude = ['madeTier', 'pairSubtype', 'drawFlags', 'equityVsRange'];
        
        fieldsToInclude.forEach(field => {
            if (handFeatures[field] !== undefined) {
                trimmed[field] = handFeatures[field];
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