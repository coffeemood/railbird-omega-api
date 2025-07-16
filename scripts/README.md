# LLM Flow Integration Test

Comprehensive test script that validates the entire LLM pipeline from hand selection to final analysis generation.

## Quick Start

```bash
# Run the full LLM flow test
npm run test:llm

# Or run directly
node scripts/test-llm-flow.js
```

## What It Tests

### Phase 1: Hand Selection & Context
- Finds a random hand that saw the river
- Displays hand metadata (cards, board, stacks, pot type)
- Generates snapshots using the existing pipeline

### Phase 2: Solver Integration
- Enriches snapshots with solver data using `Solves.prepareSnapshots()`
- Runs vector search for each snapshot
- Builds complete solver blocks with ranges, EV, recommendations
- Analyzes match rates and similarity scores

### Phase 3: LLM Processing
- Trims solver data using `SolverBlockTrimmer` for token efficiency
- Builds structured prompts using `LLMPromptBuilder` with UI tags
- Estimates token usage and API costs
- Calls `SolverLLMService.analyzeHand()` with full benchmarking
- Validates response structure and content

### Phase 4: Results & Performance
- Displays complete analysis with street comments and UI tags
- Shows identified mistakes with EV loss calculations
- Provides detailed performance metrics for each phase
- Reports token usage, costs, and provider statistics

## Sample Output

```
🚀 Starting LLM Flow Integration Test
=================================================================================

📋 PHASE 1: Hand Selection & Context
--------------------------------------------------
Hand Context:
• Hand ID: 109196
• Hero Cards: 6d6c (UTG+1)
• Board: 8d9sKh9c2h
• Effective Stack: 23.9BB
• Pot Type: SRP
• Game Type: tournament
• Saw Streets: Flop(✓) Turn(✓) River(✓)

• Hand Selection         : 23ms
• Snapshot Generation    : 15ms
• Snapshots Created      : 4

⚡ PHASE 2: Solver Integration
--------------------------------------------------
• Solver Enrichment      : 2814ms
• Enriched Snapshots     : 4
• Solver Matches         : 3/4 (75%)
• Average Similarity     : 0.847

Solver Insights:
• Snapshot 1 (FLOP): Bet 4.5BB | EV: 12.34 | Sim: 89.2%
• Snapshot 2 (TURN): Check | EV: 8.91 | Sim: 76.5%
• Snapshot 3 (RIVER): Fold | EV: -2.15 | Sim: 92.1%
• Snapshot 4 (RIVER): No solver data

🤖 PHASE 3: LLM Processing
--------------------------------------------------
• Estimated Tokens       : 1156
• Estimated Cost         : $0.0174
• Provider               : openai
• Complexity Score       : 6
• LLM Processing         : 1389ms
• Actual Tokens          : 1143
• Actual Cost            : $0.0171

📊 PHASE 4: Results & Analysis
--------------------------------------------------
LLM Analysis Results:
• Headline: "Fold River Overbet"
• TL;DR: "Standard play until river where hero correctly folds to overbet"
• Hand Score: 77/100
• Mistakes Found: 1
• Street Comments: 4/4

Street Comments:
    FLOP: "Standard <mix> with pocket pair on <board_texture>"
    TURN: "Check behind is optimal given <range villain> strength"
    RIVER: "Clear fold against overbet with <blockers> considerations"

Mistakes Identified:
    TURN: Betting would be better here (EV Loss: 0.8BB, Severity: 25/100)

Performance Report:
• Total Execution Time   : 4237ms
    Hand Selection: 23ms (0.5%)
    Snapshot Generation: 15ms (0.4%)
    Solver Enrichment: 2814ms (66.4%)
    LLM Processing: 1389ms (32.8%)
• Peak Memory Usage      : 187MB

Provider Usage:
    openai: 1 requests, 1143 tokens

✅ LLM Flow Test Completed Successfully!
```

## Environment Setup

Make sure you have the required environment variables:

```bash
# Required for LLM analysis
OPENAI_API_KEY=your_openai_key_here

# Optional for other providers
GROK_API_KEY=your_grok_key_here
GOOGLE_API_KEY=your_google_key_here

# Database connection
MONGODB_URI=your_mongodb_connection_string
```

## Test Components

### Main Test Script
- `scripts/test-llm-flow.js` - Main test orchestrator

### Helper Modules
- `scripts/helpers/hand-selector.js` - Random hand selection utilities
- `scripts/helpers/benchmark.js` - High-precision timing measurements
- `scripts/helpers/display.js` - Pretty console output formatting

### Core Services Tested
- `utils/SolverLLMService.js` - Main LLM analysis service
- `utils/SolverBlockTrimmer.js` - Token optimization
- `utils/LLMPromptBuilder.js` - Prompt construction with UI tags
- `db/collections/Solves.js` - Solver data enrichment

## Troubleshooting

### Common Issues

**No hands found:**
```
⚠️ No suitable river hands found. Trying broader search...
```
- Check that your database has hands with `info.sawRiver: true`
- Verify MongoDB connection

**LLM API errors:**
```
❌ Test Failed: LLM analysis failed: API key not found
```
- Ensure `OPENAI_API_KEY` is set in your environment
- Check API key validity and rate limits

**Solver enrichment failures:**
```
Error in enhanced hand analysis: Vector search failed
```
- Verify vector database connectivity
- Check that solver data exists for the selected hand

### Performance Notes

- Solver enrichment typically takes 2-4 seconds per hand
- LLM processing usually takes 1-2 seconds
- Total test time is typically 4-6 seconds
- Memory usage peaks around 150-200MB

### Customization

You can modify the test behavior by editing the test script:

```javascript
// Use a specific hand ID instead of random
const hand = await findHandById(123456);

// Test different LLM providers
const llmService = new SolverLLMService({
    defaultModel: 'grok',  // or 'google'
    temperature: 0.5
});

// Test different scenarios
const hand = await findHandForScenario('complex');  // or 'simple', 'tournament'
```