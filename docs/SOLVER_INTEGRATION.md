# Solver Integration Documentation

## Overview

This document describes the Phase 3.1 implementation of the solver integration for the Railbird API. The implementation provides vector search capabilities to find similar poker solver nodes and retrieve analysis data.

## Environment Variables

Add the following environment variables to your `.env` file:

```bash
# MongoDB Vector Search Configuration
MONGODB_VECTOR_SEARCH_INDEX=default  # Name of the vector search index in MongoDB Atlas
MONGODB_VECTOR_COLLECTION=lean_node_meta  # Collection name for vector search

# S3 Configuration for Solver Nodes
SOLVER_S3_BUCKET=solver-nodes  # Default S3 bucket for solver data

# Existing required variables:
# DB_STRING=<your_mongodb_connection_string>
# DB_NAME=<your_database_name>
# AWS_ACCESS_KEY_ID=<your_aws_access_key>
# AWS_SECRET_ACCESS_KEY=<your_aws_secret_key>
# AWS_REGION=ap-southeast-2  # or your preferred region
```

## API Endpoints

### 1. Generate Snapshots (with optional vector search)

**Endpoint:** `POST /v1/hands/:id/generate-snapshots?performSearch=true`

**Description:** Generates snapshots for a hand and optionally performs vector search for each snapshot.

**Query Parameters:**
- `performSearch` (boolean, optional): If `true`, performs vector search for each snapshot

**Response:**
```json
{
  "status": "success",
  "data": {
    "handId": 12345,
    "totalSnapshots": 3,
    "vectorSearchPerformed": true,
    "snapshots": [
      {
        "index": 0,
        "primaryVillain": 2,
        "heroAction": "call",
        "snapshotInput": {
          "street": "FLOP",
          "board": ["Ah", "Kd", "7s"],
          "pot_bb": 12.5,
          "stack_bb": 95,
          "positions": { "ip": "btn", "oop": "bb" },
          "action_history": ["Check", "Bet 9.75"],
          "game_type": "cash",
          "pot_type": "srp"
        },
        "hasMatch": true,
        "similarityScore": 0.87,
        "approxMultiWay": false,
        "vectorSearchResult": {
          "nodeMetadata": { ... },
          "similarityScore": 0.87,
          "isApproximation": false
        }
      }
    ]
  }
}
```

### 2. Analyze Snapshots (full analysis with solver data)

**Endpoint:** `POST /v1/hands/:id/analyze-snapshots`

**Description:** Generates snapshots, performs vector search, fetches solver nodes from S3, and transforms them to frontend format.

**Response:**
```json
{
  "status": "success",
  "data": {
    "handId": 12345,
    "stats": {
      "totalSnapshots": 3,
      "matchedSnapshots": 2,
      "averageSimilarity": 0.76
    },
    "snapshots": [
      {
        "index": 0,
        "primaryVillain": 2,
        "primaryVillainPosition": "btn",
        "heroAction": "call",
        "snapshotInput": { ... },
        "hasMatch": true,
        "similarityScore": 0.87,
        "approxMultiWay": false,
        "solver": {
          "nodeId": "0-0-c11",
          "street": "FLOP",
          "board": ["Ah", "Kd", "7s"],
          "pot": 12.5,
          "stacks": { "oop": 95, "ip": 95 },
          "positions": { "ip": "btn", "oop": "bb" },
          "whoIsNext": "oop",
          "topActions": [
            { "action": "Check", "freq": 65, "ev": 4.2 },
            { "action": "Bet 3.5", "freq": 25, "ev": 4.8 },
            { "action": "Bet 9.75", "freq": 10, "ev": 3.1 }
          ],
          "comboData": {
            "AhAs": "X:65:4.2;B 3.5:25:4.8;B 9.75:10:3.1"
          },
          "ranges": {
            "oop": "AhAs:1.0,KhKs:1.0,...",
            "ip": "7h7s:1.0,AhKh:1.0,..."
          }
        }
      }
    ]
  }
}
```

## Module Architecture

### 1. `utils/vectorSearch.js`
- **Purpose:** Handles vector search functionality
- **Key Functions:**
  - `buildFeatureVector(snapshotInput)`: Converts snapshot to 61-dimension feature vector
  - `findSimilarNode(snapshotInput, options)`: Queries MongoDB vector search index
  - `batchFindSimilarNodes(snapshotInputs, options)`: Batch processing support

### 2. `utils/solverNodeService.js`
- **Purpose:** Handles S3 fetching and data transformation
- **Key Functions:**
  - `getUnpackedNode(leanNodeMeta)`: Fetches and decompresses solver node from S3
  - `transformNodeToSolverBlock(nodeAnalysis)`: Converts to frontend format
  - `processSnapshotWithSolverData(snapshot)`: End-to-end processing
  - `batchProcessSnapshots(snapshots)`: Batch processing support

### 3. `utils/solver-snapshot-generator.js` (existing)
- **Purpose:** Generates snapshots from hand data
- **Key Functions:**
  - `generateSnapshots(hand)`: Main entry point for snapshot generation

## Feature Vector Structure (61 dimensions)

Matches Rust FeatureVector structure exactly:

1. **Street (0):** 1 dimension
   - Street indicator (0=Turn, 1=River, 2=Flop) as float

2. **Game type (1):** 1 dimension
   - Game type (0=Cash, 1=MTT) as float

3. **Pot type (2):** 1 dimension
   - Pot type (0=SRP, 1=3BP, 2=4BP) as float

4. **OOP position (3-16):** 14 dimensions
   - One-hot encoded OOP position [EMPTY, UTG, UTG+1, UTG+2, UTG+3, MP, MP+1, MP+2, LJ, HJ, CO, BU, SB, BB]

5. **IP position (17-30):** 14 dimensions
   - One-hot encoded IP position [EMPTY, UTG, UTG+1, UTG+2, UTG+3, MP, MP+1, MP+2, LJ, HJ, CO, BU, SB, BB]

6. **Board texture (31-38):** 8 dimensions
   - [31] Paired board - Whether the board contains a pair or higher (0 or 1)
   - [32] Monotone flop - Whether all three flop cards are the same suit (0 or 1)
   - [33] Two-tone - Whether the board has exactly 2 suits (0 or 1)
   - [34] Connected - Whether the board has connected cards (straights possible) (0 or 1)
   - [35] Primary archetype - Flop classification (HHH=25, HHM=50, HHL=75, HMM=100, HML=125, HLL=150, MMM=175, MML=200, MLL=225, LLL=240)
   - [36] Secondary features - Gap size, wheel potential, broadway potential (encoded in bits)
   - [37] Ace present - Whether the board contains an Ace (0 or 1)
   - [38] Max rank normalized - Highest rank normalized to 0-255 scale

7. **Position flag (39):** 1 dimension
   - Position flag (0=OOP to act, 1=IP to act)

8. **Stack size (40):** 1 dimension
   - Effective stack size in BBs (normalized by /100)

9. **Pot size (41):** 1 dimension
   - Pot size in BBs (normalized by /100)

10. **Tag flags (42-57):** 16 dimensions
    - One-hot encoded scenario tags (reserved for future use)

11. **Action hash (58-60):** 3 dimensions
    - Action history hash components (3 bytes normalized to 0-1)
    - Uses canonicalized action history with pot-relative bet sizing buckets

## Data Structure Mappings

### Position Mappings (PosNodeId)
- BB = 13, SB = 12, BU/BTN = 11, CO = 10
- HJ = 9, LJ = 8, MP2 = 7, MP1 = 6
- MP = 5, UTG3 = 4, UTG2 = 3, UTG1 = 2, UTG = 1

### Street Mappings (StreetId)
- FLOP = 2, TURN = 0, RIVER = 1
- Note: PREFLOP is not included as solvers only work postflop

### Action Mappings (ActionId)
- Check = 0, Bet = 1, Call = 2, Raise = 3, Fold = 4, AllIn = 5

### Game Type Mappings (GameTypeId)
- Cash = 0, MTT/Tournament = 1

### Pot Type Mappings (PotTypeId)
- SRP/2BP = 0, 3BP = 1, 4BP/5BP/AIPF = 2

### Board Texture Archetype Classifications
Flops are classified into strategic archetypes based on rank distribution:

**Rank Categories:**
- High: 9,T,J,Q,K,A (ranks 9-12)
- Medium: 6,7,8 (ranks 5-8)
- Low: 2,3,4,5 (ranks 0-4)

**Archetype Values:**
- HHH = 25 (e.g., AKQ, KQJ) - All high cards
- HHM = 50 (e.g., AK7, QJ8) - Two high, one medium
- HHL = 75 (e.g., KJ3, AQ4) - Two high, one low
- HMM = 100 (e.g., Q87, J76) - One high, two medium
- HML = 125 (e.g., Q72, K64) - One high, one medium, one low
- HLL = 150 (e.g., A32, K43) - One high, two low
- MMM = 175 (e.g., 876, 987) - All medium cards
- MML = 200 (e.g., 873, 652) - Two medium, one low
- MLL = 225 (e.g., 732, 642) - One medium, two low
- LLL = 240 (e.g., 432, 532) - All low cards

**Secondary Features Encoding (byte 36):**
- Bits 0-2: Gap between highest and middle card (0-7)
- Bits 3-4: Wheel potential (A-5 straight draws) (0-3)
- Bits 5-6: Broadway potential (T-A straight draws) (0-3)
- Bit 7: Reserved for future use

### Action History Canonicalization
Actions are canonicalized for consistent hashing:

**Action Tokens:**
- Check = "X"
- Call = "C"
- Fold = "F"
- Bet = "B" + bucketed percentage
- Raise = "R" + bucketed percentage
- All-in = "A" + bucketed percentage

**Bet Size Buckets (as % of pot):**
- 0: 0% (no bet)
- 5: Up to 5%
- 10: 5-15%
- 20: 15-25%
- 30: 25-35% (e.g., 1/3 pot)
- 40: 35-45%
- 50: 45-55% (e.g., 1/2 pot)
- 60: 55-65%
- 70: 65-75% (e.g., 2/3 pot)
- 80: 75-85%
- 90: 85-95%
- 100: 95-110% (pot size bet)
- 125: 110-130%
- 150: 130-170%
- 200: 170-250%
- 250: Over 2.5x pot

**Example:** "Check, Bet 9.75" with pot=10 → "X-B100" (bet is ~97.5% of pot)

## MongoDB LeanNodeMeta Structure

The vector search returns documents with this structure:
```json
{
  "_id": "unique_identifier",
  "original_node_id": "0-0-c11",
  "vector": [/* 61 float values */],
  "flop_basename": "cash_100bb_srp_bb_btn_AdKdQh",
  "s3_bucket": "solver-nodes",
  "s3_key": "v1/xx/yy/root_id.zst",
  "offset": 0,
  "length": 12345,
  "street": 2,  // 0=Turn, 1=River, 2=Flop
  "game_type": 0,  // 0=Cash, 1=MTT
  "pot_type": 0,  // 0=SRP, 1=3BP, 2=4BP
  "positions": [13, 11],  // [OOP, IP] position IDs
  "board_tex": [/* 8 byte values */],
  "pos_flag": 0,  // 0 for OOP, 1 for IP
  "stack_bb": 95.0,
  "pot_bb": 12.5,
  "act_hash": 123456,
  "tag_ids": [/* array of u16 */]
}

## Error Handling

- Vector search failures return `approxMultiWay: true`
- S3 fetch failures are logged and return null solver data
- All errors include descriptive messages in the response

## Testing

To test the implementation:

1. Ensure MongoDB has a `lean_node_meta` collection with vector search index
2. Ensure S3 bucket contains compressed solver nodes
3. Upload a hand history file
4. Call generate-snapshots with `performSearch=true`
5. Call analyze-snapshots for full analysis

## Future Enhancements

- Implement proper Bincode decoding (currently using JSON)
- Add caching for frequently accessed solver nodes
- Implement on-demand solver queue for missing nodes
- Add metrics and monitoring for vector search performance