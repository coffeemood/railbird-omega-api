/**
 * Hand Selection Helper
 * 
 * Utilities for finding and selecting hands for testing
 */

const Hands = require('../../db/collections/Hands');

/**
 * Find a random hand that saw the river
 * @returns {Promise<Object|null>} Random hand or null if none found
 */
async function findRandomRiverHand() {
    try {
        // Build aggregation pipeline to find hands that saw river
        const aggregation = [
            {
                $match: {
                    _id: 10109747,
                    'info.sawRiver': true,
                    // Additional filters for better test data
                    'info.effStack': { $gte: 10, $lte: 200 }, // Reasonable stack sizes
                    'info.potType': { $in: ['srp', '3bp', '4bp'] }, // Common pot types
                    'preflopSummary.cards': { $exists: true }, // Has hero cards
                    'board': { $exists: true } // Has board cards
                }
            },
            {
                $sample: { size: 1 } // Get random sample
            },
            {
                $project: {
                    // Include all relevant fields for testing
                    _id: 1,
                    preflopSummary: 1,
                    flopSummary: 1,
                    turnSummary: 1,
                    riverSummary: 1,
                    info: 1,
                    header: 1,
                    board: 1,
                    actionScript: 1,
                    playerChips: 1,
                    players: 1,
                    spoilers: 1
                }
            }
        ];

        const results = await Hands.aggregate(aggregation);
        
        if (results.length === 0) {
            console.log('⚠️  No suitable river hands found. Trying broader search...');
            
            // Fallback: try any hand that saw river without additional filters
            const fallbackAggregation = [
                {
                    $match: {
                        'info.sawRiver': true
                    }
                },
                {
                    $sample: { size: 1 }
                }
            ];
            
            const fallbackResults = await Hands.aggregate(fallbackAggregation);
            return fallbackResults.length > 0 ? fallbackResults[0] : null;
        }
        
        return results[0];
        
    } catch (error) {
        console.error('Error finding random river hand:', error);
        throw error;
    }
}

/**
 * Find hands by specific criteria
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Array of matching hands
 */
async function findHandsByCriteria(criteria = {}) {
    try {
        const defaultCriteria = {
            'info.sawRiver': true,
            ...criteria
        };
        
        const hands = await Hands.findByQuery(defaultCriteria, { limit: 10 });
        return hands;
        
    } catch (error) {
        console.error('Error finding hands by criteria:', error);
        throw error;
    }
}

/**
 * Get hand statistics for testing
 * @returns {Promise<Object>} Hand statistics
 */
async function getHandStatistics() {
    try {
        const stats = await Hands.aggregate([
            {
                $group: {
                    _id: null,
                    totalHands: { $sum: 1 },
                    riverHands: {
                        $sum: {
                            $cond: [{ $eq: ['$info.sawRiver', true] }, 1, 0]
                        }
                    },
                    turnHands: {
                        $sum: {
                            $cond: [{ $eq: ['$info.sawTurn', true] }, 1, 0]
                        }
                    },
                    flopHands: {
                        $sum: {
                            $cond: [{ $eq: ['$info.sawFlop', true] }, 1, 0]
                        }
                    },
                    avgEffStack: { $avg: '$info.effStack' },
                    potTypes: { $push: '$info.potType' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalHands: 1,
                    riverHands: 1,
                    turnHands: 1,
                    flopHands: 1,
                    riverRate: {
                        $multiply: [
                            { $divide: ['$riverHands', '$totalHands'] },
                            100
                        ]
                    },
                    avgEffStack: { $round: ['$avgEffStack', 1] }
                }
            }
        ]);
        
        return stats.length > 0 ? stats[0] : null;
        
    } catch (error) {
        console.error('Error getting hand statistics:', error);
        throw error;
    }
}

/**
 * Find a specific hand by ID for testing
 * @param {number} handId - Hand ID to find
 * @returns {Promise<Object|null>} Hand or null if not found
 */
async function findHandById(handId) {
    try {
        const hand = await Hands.findOneByQuery({ _id: handId });
        return hand;
    } catch (error) {
        console.error(`Error finding hand ${handId}:`, error);
        throw error;
    }
}

/**
 * Find hands suitable for specific testing scenarios
 * @param {string} scenario - Testing scenario ('complex', 'simple', 'bluff', 'value')
 * @returns {Promise<Object|null>} Suitable hand or null
 */
async function findHandForScenario(scenario) {
    try {
        let criteria = {
            'info.sawRiver': true
        };
        
        switch (scenario) {
            case 'complex':
                criteria = {
                    ...criteria,
                    'info.potType': { $in: ['3bp', '4bp', '5bp'] },
                    'info.effStack': { $gte: 50 }
                };
                break;
                
            case 'simple':
                criteria = {
                    ...criteria,
                    'info.potType': 'srp',
                    'info.effStack': { $lte: 30 }
                };
                break;
                
            case 'tournament':
                criteria = {
                    ...criteria,
                    'header.gametype': 'tournament'
                };
                break;
                
            case 'cash':
                criteria = {
                    ...criteria,
                    'header.gametype': 'cashgame'
                };
                break;
                
            default:
                // Use default criteria
                break;
        }
        
        const results = await Hands.aggregate([
            { $match: criteria },
            { $sample: { size: 1 } }
        ]);
        
        return results.length > 0 ? results[0] : null;
        
    } catch (error) {
        console.error(`Error finding hand for scenario ${scenario}:`, error);
        throw error;
    }
}

module.exports = {
    findRandomRiverHand,
    findHandsByCriteria,
    getHandStatistics,
    findHandById,
    findHandForScenario
};