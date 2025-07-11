// Node.js script to query solves collection and format for mass solver input
// Creates normalized JSON structure with range normalization

const { MongoClient } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

// Helper function to normalize ranges from combo strings like "3h2h:1.0,4h2h:1.0"
function normalizeRange(rangeString) {
  if (!rangeString || typeof rangeString !== 'string') return {};
  
  const handGroups = {};
  const combos = rangeString.split(',');
  
  for (const combo of combos) {
    const [hand, freqStr] = combo.split(':');
    if (!hand || !freqStr) continue;
    
    const freq = parseFloat(freqStr);
    if (isNaN(freq) || freq === 0) continue;
    
    // Extract ranks and suits
    const ranks = hand.match(/[AKQJT2-9]/g);
    const suits = hand.match(/[hdcs]/g);
    
    if (!ranks || ranks.length < 2 || !suits || suits.length < 2) continue;
    
    let normalizedHand;
    
    if (ranks[0] === ranks[1]) {
      // Pocket pairs
      normalizedHand = ranks[0] + ranks[0];
    } else {
      // Non-pairs - check if suited or offsuit
      const isSuited = suits[0] === suits[1];
      
      // Sort by rank hierarchy (higher rank first)
      const rankOrder = 'AKQJT98765432';
      const sortedRanks = [ranks[0], ranks[1]].sort((a, b) => 
        rankOrder.indexOf(a) - rankOrder.indexOf(b)
      );
      normalizedHand = sortedRanks.join('') + (isSuited ? 's' : 'o');
    }
    
    // Group combos by normalized hand
    if (!handGroups[normalizedHand]) {
      handGroups[normalizedHand] = [];
    }
    handGroups[normalizedHand].push(freq);
  }
  
  // Calculate average frequency for each hand and format as string
  const normalizedPairs = [];
  for (const [hand, frequencies] of Object.entries(handGroups)) {
    const avgFreq = frequencies.reduce((sum, f) => sum + f, 0) / frequencies.length;
    normalizedPairs.push(`${hand}:${avgFreq}`);
  }
  
  return normalizedPairs.join(',');
}

// Helper function to merge multiple range strings into one
function mergeRanges(rangeStrings) {
  const allCombos = [];
  
  rangeStrings.forEach(rangeString => {
    if (rangeString && typeof rangeString === 'string') {
      const combos = rangeString.split(',');
      allCombos.push(...combos);
    }
  });
  
  return allCombos.join(',');
}

async function queryRanges() {
  const client = new MongoClient(process.env.DB_STRING);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const collection = db.collection('solves');
    
    const results = await collection.aggregate([
      // Filter for documents with empty actionHistory
      {
        $match: {
          actionHistory: { $size: 0 }
        }
      }
    ]).toArray();
    
    // Process results and group by unique combinations
    const groupedData = {};
    
    results.forEach(doc => {
      const baseKey = `${doc.gameType}-${doc.potType}-${doc.effStack}-${doc.positions.oop} vs ${doc.positions.ip}`;
      
      if (!groupedData[baseKey]) {
        groupedData[baseKey] = {
          gameType: doc.gameType,
          potType: doc.potType,
          effStack: doc.effStack,
          matchUp: `${doc.positions.oop} vs ${doc.positions.ip}`,
          oopRanges: [],
          ipRanges: []
        };
      }
      
      // Collect all ranges for this combination
      if (doc.rangeStats?.oop) {
        groupedData[baseKey].oopRanges.push(doc.rangeStats.oop);
      }
      
      if (doc.rangeStats?.ip) {
        groupedData[baseKey].ipRanges.push(doc.rangeStats.ip);
      }
    });
    
    // Process grouped data to create final output
    const massSolverData = [];
    
    Object.values(groupedData).forEach(group => {
      // Merge and normalize OOP ranges
      if (group.oopRanges.length > 0) {
        const mergedOopRange = mergeRanges(group.oopRanges);
        massSolverData.push({
          gameType: group.gameType,
          potType: group.potType,
          effStack: group.effStack,
          matchUp: group.matchUp,
          position: group.matchUp.split(' vs ')[0],
          range: normalizeRange(mergedOopRange)
        });
      }
      
      // Merge and normalize IP ranges
      if (group.ipRanges.length > 0) {
        const mergedIpRange = mergeRanges(group.ipRanges);
        massSolverData.push({
          gameType: group.gameType,
          potType: group.potType,
          effStack: group.effStack,
          matchUp: group.matchUp,
          position: group.matchUp.split(' vs ')[1],
          range: normalizeRange(mergedIpRange)
        });
      }
    });
    
    // Sort by effStack (numeric sort)
    massSolverData.sort((a, b) => {
      const aStack = parseInt(a.effStack.replace('bb', ''));
      const bStack = parseInt(b.effStack.replace('bb', ''));
      return aStack - bStack;
    });
    
    console.log(`Generated ${massSolverData.length} range entries for mass solver`);
    
    // Create CSV content
    const csvHeaders = 'gameType,potType,effStack,matchUp,position,range\n';
    const csvRows = massSolverData.map(row => 
      `${row.gameType},${row.potType},${row.effStack},"${row.matchUp}",${row.position},"${row.range}"`
    ).join('\n');
    
    const csvContent = csvHeaders + csvRows;
    
    // Write to CSV file
    const filename = `ranges_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    fs.writeFileSync(filename, csvContent);
    
    console.log(`CSV exported to: ${filename}`);
    console.log(`First 3 entries:`);
    console.log(JSON.stringify(massSolverData.slice(0, 3), null, 2));
    
    return massSolverData;
    
  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run the query
queryRanges().catch(console.error);

// Alternative version that creates separate documents for IP and OOP ranges
// Uncomment if you prefer this structure:

/*
async function queryRangesAlternative() {
  const client = new MongoClient(process.env.DB_STRING);
  
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('solves');
    
    const results = await collection.aggregate([
      {
        $match: {
          actionHistory: { $size: 0 }
        }
      },
      {
        $project: {
          gameType: 1,
          potType: 1,
          street: 1,
          board: 1,
          effStack: 1,
          positions: 1,
          pot: 1,
          stackOOP: 1,
          stackIP: 1,
          nextToAct: 1,
          ranges: [
            {
              position: "oop",
              positionName: "$positions.oop",
              range: "$rangeStats.oop"
            },
            {
              position: "ip", 
              positionName: "$positions.ip",
              range: "$rangeStats.ip"
            }
          ]
        }
      },
      {
        $unwind: "$ranges"
      },
      {
        $group: {
          _id: {
            gameType: "$gameType",
            potType: "$potType",
            position: "$ranges.position"
          },
          scenarios: {
            $push: {
              _id: "$_id",
              street: "$street",
              board: "$board",
              effStack: "$effStack",
              positionName: "$ranges.positionName",
              pot: "$pot",
              stack: {
                $cond: {
                  if: { $eq: ["$ranges.position", "oop"] },
                  then: "$stackOOP",
                  else: "$stackIP"
                }
              },
              range: "$ranges.range"
            }
          }
        }
      },
      {
        $sort: {
          "_id.gameType": 1,
          "_id.potType": 1,
          "_id.position": 1
        }
      }
    ]).toArray();
    
    console.log(JSON.stringify(results, null, 2));
    return results;
    
  } finally {
    await client.close();
  }
}
*/