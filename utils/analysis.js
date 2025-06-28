const OpenAI = require('openai');
const { convertHandHistoryToText } = require('./hand-utils');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs').promises;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const example = `[{
  "tlDr": "Hero's fold on the flop with 88 may be too tight given pot odds and potential equity against a short-stacked opponent.",
  "mistakes": [
    {
      "street": "Flop",
      "error": "Folding 88 to a single bet on A-high board despite reasonable pot odds and potential equity vs short-stacked UTG+1's polarized range.",
      "evLoss": "1.5 BB",
      "severity": 65,
      "alternatives": [
        "Call flop (30-35% equity vs UTG+1's c-bet range) to realize equity on safe turns/bluff catch",
        "Occasional check-raise (vs weak Ax/KQ) given SPR ~6.6"
      ]
    }
  ],
  "considerations": [
    "UTG+1's short stack (36.5BB) suggests possible linear/open-wide strategy - defend BB wider pre vs small 3x opens",
    "A-high boards hit UTG+1's EP raising range, but 88 still has 25-30% equity vs c-betting range (Ax, TT-QQ, KQ, bluffs)",
    "Low SPR (6.6) allows Hero to realize equity cheaply - fold equity on later streets vs weak Ax"
  ],
  "villainProfile": [
    {
      "context": "Short-stacked UTG+1 (36.5BB)",
      "recommendedAdjustment": "Defend BB wider (15-18% vs 3x) pre; station more on A/K-high boards given opponent's limited stack depth"
    }
  ],
  "handScore": 72,
  "streetComments": [
    {
      "street": "Preflop",
      "comment": "Call correct (top 12% of BB defend range). 3-bet marginal (88 vs UTG+1 8% open range = 55-45 equity). SPR 6.6 postflop."
    },
    {
      "street": "Flop",
      "comment": "A-high favors UTG+1, but 88 retains 25-30% equity. Pot 6.5BB → call 4BB (27% equity needed). Check-call preserves equity vs 33% c-bet frequency."
    }
  ]
},

{
  "tlDr": "Hero misplayed river by betting into completed flush, losing significant EV with thin value/bluff line.",
  "mistakes": [
  {
  "street": "Flop",
  "error": "Donk-bet multiway into UTG raiser/BU caller (weakens range, invites aggression)",
  "evLoss": "2-3 BB",
  "severity": 40,
  "alternatives": ["Check to UTG (default), x/c or x/r depending on action"]
  },
  {
  "street": "River",
  "error": "Bluff/value bet into completed flush with marginal pair (KTs under-repped, blocks few bluffs)",
  "evLoss": "15-20 BB",
  "severity": 85,
  "alternatives": ["Check-call (induce bluffs) or check-fold vs polarized range"]
  }
  ],
  "considerations": [
  "UTG opens ~12% (77+, AQo+, suited broadway), BU flats widen to 25% (mid pairs, suited connectors)",
  "River 7c completes flush - UTG range contains more AcXc combos (AQs/AJs) than Hero",
  "Short BU stack (57BB) incentivizes UTG to play aggressively for side pot pressure"
  ],
  "villainProfile": [
  {
  "context": "UTG raises pre, 3bets flop multiway, barrels turn on 4h",
  "recommendedAdjustment": "Weight range toward overpairs (JJ-AA), AcXc draws, sets - fold most bluffs vs river lead"
  }
  ],
  "handScore": 45,
  "streetComments": [
  {
  "street": "Preflop",
  "comment": "BB call vs UTG open + BU flat: KTs (top 25% of BB defend range) - standard"
  },
  {
  "street": "Flop",
  "comment": "T83cc: Check 85% (protect x/c range), bet small 15% (polarized). Pot control vs UTG's 3! range (TT/88/33/AcXc)"
  },
  {
  "street": "Turn",
  "comment": "4h adds BDFD: Check-call optimal (equity vs overpairs, block AcKc/AcQc)"
  },
  {
  "street": "River",
  "comment": "7c completes flush: Check 100% (induce bluffs from AA/KK, avoid stacking vs AcXc). Pot ≈140BB eff"
  }
  ]
  },
  {
    "tlDr": "Hero made significant preflop and turn mistakes with KQo in SB vs UTG open, leading to EV loss and tough post-flop spots.",
    "mistakes": [
      {
        "street": "preflop",
        "error": "Called with KQo in SB vs UTG open +4 callers",
        "evLoss": "3-5 BB",
        "severity": 70,
        "alternatives": ["Fold preflop (KQo is dominated/weak OOP)"]
      },
      {
        "street": "turn",
        "error": "Check-folded pair of 5s with K kicker getting 3:1 odds",
        "evLoss": "1-2 BB",
        "severity": 50,
        "alternatives": ["Check-call turn (needs 25% equity vs UTG's range)"]
      }
    ],
    "considerations": [
      "SB vs UTG open requires top 8% hands (KQo is borderline bottom of calling range)",
      "Paired flop reduces value of overcards - KQ has limited improvement potential",
      "UTG turn lead after multi-way check-through often represents polarized range (boats/air)"
    ],
    "villainProfile": [
      {
        "context": "UTG opens 3BB then checks flop in multi-way pot",
        "recommendedAdjustment": "Weight range toward overpairs (TT+) and 5x (A5s) more than bluffs"
      }
    ],
    "handScore": 45,
    "streetComments": [
      {
        "street": "preflop",
        "comment": "SB vs UTG open: Fold 85%+ of range. KQo (≈12% equity vs UTG) should fold given stack depth and positional disadvantage."
      },
      {
        "street": "turn",
        "comment": "After brick turn: Hero's KQ (≈18% vs UTG's value range) should consider float with backdoor gutshot. Pot control line preferred."
      }
    ]
  },
  {
  "tlDr": "Hero holds a strong combo draw but misses additional fold-equity opportunities.",
  "mistakes": [
    {
      "street": "Flop",
      "error": "Small c-bet sizing on a super-wet monotone board with a big combo draw, missing potential fold equity or bigger pot building.",
      "evLoss": "0.5 BB",
      "severity": 30,
      "alternatives": [
        "Use a larger flop c-bet to apply pressure",
        "Consider a 3-bet vs. check-raise to maximize fold equity"
      ]
    },
    {
      "street": "River",
      "error": "Not seizing a bluff opportunity despite blocking key flush combos and facing a check from Villain.",
      "evLoss": "1.0 BB",
      "severity": 40,
      "alternatives": [
        "Bet as a bluff targeting folds from better pairs",
        "Check only if expecting showdown value to win often enough"
      ]
    }
  ],
  "considerations": [
    "Button open range ~40%; Q9o is near the borderline but still acceptable",
    "Monotone flop structure increases check-raise frequency; plan for aggression or pot control",
    "Villain's wide BB defense can include strong draws, making postflop play tricky"
  ],
  "villainProfile": [
    {
      "context": "Villain defends widely from the BB and is capable of raising flop draws aggressively",
      "recommendedAdjustment": "Adopt a polarized c-bet strategy and be ready to 3-bet big draws for fold equity"
    }
  ],
  "handScore": 70,
  "streetComments": [
    {
      "street": "Preflop",
      "comment": "Open top ~40% from BU; 2BB standard with Q9o is viable given position and stack depth."
    },
    {
      "street": "Flop",
      "comment": "Monotone JcTc7c is very draw-heavy; bigger c-bet or check back occasionally with strong draws for balance."
    },
    {
      "street": "Turn",
      "comment": "5h doesn't improve Hero, but pot odds + 15 outs justify a straightforward call."
    },
    {
      "street": "River",
      "comment": "9d gives a marginal pair; consider a bluff if you believe better pairs fold often enough."
    }
  ]
}

]`;

const googleModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  systemInstruction: `You are a top GTO poker coach. Analyze this poker hand by Hero, follow the following example of a well worded response: 
  ${example}
  `
});

const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const { promisify } = require('util');


const sleep = promisify(setTimeout);

const deepseekKey = process.env.DEEPSEEK_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;
const openAI = new OpenAI({
  apiKey: openAIKey
});

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: deepseekKey
});

// const anthropic = new Anthropic({
//   apiKey: '',
// });

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 5, // Adjust based on your OpenAI tier
  timeWindow: 1000, // 1 minute in milliseconds
  maxRetries: 3,
  backoffFactor: 1.5 // Exponential backoff multiplier
};

// Track API calls
let apiCalls = [];

// Simple in-memory cache (consider using Redis for production)
const analysisCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const trimmedJSON = (handData) => {
  // Create a copy to avoid modifying the original
  const trimmedData = JSON.parse(JSON.stringify(handData));

  // Remove unnecessary header fields
  const headerFieldsToKeep = [ 'room', 'pokertype', 'limit', 'sb', 'bb', 'gametype', 'players', 'maxseats' ];

  Object.keys(trimmedData.header).forEach(key => {
    if (!headerFieldsToKeep.includes(key)) {
      delete trimmedData.header[key];
    }
  });

  // Remove other large unnecessary sections
  delete trimmedData.raw;
  delete trimmedData.notes;
  delete trimmedData.totalPot;
  delete trimmedData.board;

  return trimmedData;
};

const analysisPrompts = (trimmedHandData) => ({
  summary: `You are a top GTO poker coach. Analyze this poker hand by Hero (format:${trimmedHandData}):
    1. Identify 3 mistakes
    2. Suggest alternative lines
    3. Estimate range advantage
    4. Key Decision Points: max 3

    Return only JSON with:
    {
    "tlDr": 1-sentence summary,
    "keyDecisions": { street: "...", impact: "low/medium/high", error: "..." } // must follow object format,
    "considerations": 1-2 bullet points of ranges and villain positions / stack sizes to consider,
    "handScore": 0-100 rating
    }
  `,
  basic: `You are a top GTO poker coach specialized in deep-stack cash games (6-max and full-ring).  
Consider the nuances of cash game strategy, including balancing ranges, deep-stacked play, and exploitative adjustments.  
Evaluate Hero’s play based on optimal strategy and potential deviations against specific player types.
Also consider when board texture affects relative ranges and take adaptive lines
Consider unorthodox lines as well like using blockers, checking back strong hands, or turning a hand into a bluff. 
(${trimmedHandData}):  

1. Consider the stack depths, positions, and rake structure.  
2. Be aware of standard preflop ranges and how they adjust based on pool tendencies.  
3. Identify key range adjustments based on villain profiles and player tendencies.  
4. Analyze the effectiveness of aggression and defensive strategies postflop.  
5. Provide street-by-street analysis with sizing recommendations, blocker considerations, and range interactions.  
6. Do not analyze other players’ mistakes—only Hero’s.
  
  Return only JSON with:
  {
    "tlDr": "1-sentence",
    "mistakes": [{"street": "...", "error": "...", "evLoss": "X BB", 'severity': 0-100, "alternatives": ["..."]}] // must follow object format, if no mistakes, return []
    "considerations": [1-3 bullet points of ranges and villain positions / stack sizes / board texture to consider] // must follow array format,
    "villainProfile": [{"context": "...", "recommendedAdjustment": "..."}] // must follow format,
    "exploitations": [
    {"versus": "GTO Opponent", "adjustment": "..."},
    {"versus": "Overly Aggressive Opponent", "adjustment": "..."},
    {"versus": "Passive Opponent", "adjustment": "..."},
    ] // must follow format,  only when hero VPIP and talk about postflop only
    "handScore": 0-100 // must follow number format,
    "streetComments": [{"street": "...", "comment": "..."}] //  must follow format, recommend starting ranges percentages, provide advice based on board texture, blockers, pot sizes. 
  }`,
  tournament: `You are a top GTO poker coach specialized in multi-table tournaments (MTTs).
Consider ICM implications, short stacks, typical MTT payout structures, and standard jam/fold spots.  
Consider unorthodox lines as well like using blockers or turning a hand into a bluff.
(${trimmedHandData}):
  1. Consider the tournament structure and the current blinds / ante
  2. Be aware of tournament ranges and shove/fold dynamics and ICM considerations
  3. Key range adjustments for this spot
  4. Villain tendency analysis based on position and stack sizes
  6. Do not analyze other players mistakes, only Hero's
  5. Street-by-street advice - recommend starting ranges, board texture and pot sizes. Ignore streets where Hero foled.
  Return only JSON with:
  {
    "tlDr": "1-sentence",
    "mistakes": [{"street": "...", "error": "...", "evLoss": "X BB", 'severity': 0-100, "alternatives": ["..."]}] // must follow object format, if no mistakes, return []
    "considerations": [1-3 bullet points of ranges and villain positions / stack sizes / board texture to consider] // must follow array format,
    "villainProfile": [{"context": "...", "recommendedAdjustment": "..."}] // must follow format,
    "exploitations": [
    {"versus": "GTO Opponent", "adjustment": "..."},
    {"versus": "Overly Aggressive Opponent", "adjustment": "..."},
    {"versus": "Passive Opponent", "adjustment": "..."},
    ] // must follow format,  only when hero VPIP and talk about postflop only
    "handScore": 0-100 // must follow number format,
    "streetComments": [{"street": "...", "comment": "..."}] //  must follow format, recommend starting ranges percentages, provide advice based on board texture, blockers, pot sizes. Ignore streets where Hero foled. 
  }`
});

async function checkRateLimit() {
  const now = Date.now();
  // Clean up old entries
  apiCalls = apiCalls.filter(timestamp => now - timestamp < RATE_LIMIT.timeWindow);

  if (apiCalls.length >= RATE_LIMIT.maxRequests) {
    const oldestCall = apiCalls[0];
    const waitTime = RATE_LIMIT.timeWindow - (now - oldestCall);
    return waitTime > 0 ? waitTime : 0;
  }
  return 0;
}

async function analyzeWithRetry(hand, modelType = 'grok', attempt = 1) {
  const trimmed = trimmedJSON(hand);
  const isTournament = trimmed.header.gametype === 'tournament';
  const trimmedHandData = convertHandHistoryToText(trimmed);
  console.log(trimmedHandData);
  const cacheKey = `${modelType}-${JSON.stringify(trimmedHandData)}`;

  // Check cache first
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey);
  }

  try {
    // Check rate limit
    const waitTime = await checkRateLimit();
    if (waitTime > 0) {
      await sleep(waitTime);
    }

    // const prompt = analysisPrompts(trimmedHandData);
    const prompt = analysisPrompts(trimmedHandData);
    let analysis;
    let result;

    if (modelType === 'openai') {
      analysis = await openAI.chat.completions.create({
        // model: 'ft:gpt-4o-mini-2024-07-18:personal:railbird-002:B1P40clo',
        // model: 'ft:gpt-4o-mini-2024-07-18:personal:railbird-003:B1QsQyKs',
        // model: 'ft:gpt-4o-mini-2024-07-18:personal::B1uEe3O1',
        model: 'ft:gpt-4o-mini-2024-07-18:personal:my-gto-coach-3:B3O6rADI',
        // model: 'gpt-4.1-nano',
        messages: [ {
          role: 'user',
          content: isTournament ? prompt.tournament : prompt.basic,
        } ],
        temperature: 0.3,
      });

      // await saveAnalysisLog(formattedPrompt, analysis.choices[0].message.content, 'chatgpt-4o-latest');
      result = analysis.choices[0].message.content;
    // } else if (modelType === 'claude') {
    //   analysis = await anthropic.messages.create({
    //     model: 'claude-3-5-sonnet-20241022',
    //     max_tokens: 1024,
    //     messages: [ {
    //       role: 'user',
    //       content: isTournament ? prompt.tournament : prompt.basic,
    //     } ],
    //   });
    //   // console.log(analysis);
    //   result = analysis.content[0].text;
    } else if (modelType === 'deepseek') {
      analysis = await deepseek.chat.completions.create({
        model: 'deepseek-reasoner',
        messages: [ {
          role: 'user',
          content: isTournament ? prompt.tournament : prompt.basic,
        } ],
        temperature: 0.7,
        // max_tokens: 1000,
      });

      console.log(analysis.choices[0].message.content);
      return analysis.choices[0].message.content;
    } else if (modelType === 'google') {
      const googleResult = await googleModel.generateContent({
        contents: [
          { role: 'user', parts: [ { text: isTournament ? prompt.tournament : prompt.basic } ] }
        ],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 1,
        },
      });
      return googleResult.response.text();
    } else if (modelType === 'grok') {
      const grokResult = await grok.chat.completions.create({
        model: 'grok-3-mini-beta',
        messages: [ {
          role: 'user',
          content: isTournament ? prompt.tournament : prompt.basic,
        } ],
      });
      return grokResult.choices[0].message.content;
    } else {
      throw new Error(`Unsupported model type: ${modelType}`);
    }

    // Record successful API call
    apiCalls.push(Date.now());

    // Cache the result
    analysisCache.set(cacheKey, result);
    setTimeout(() => analysisCache.delete(cacheKey), CACHE_TTL);

    return result;
  } catch (error) {
    if (error.status === 429 && attempt < RATE_LIMIT.maxRetries) {
      const backoffTime = Math.pow(RATE_LIMIT.backoffFactor, attempt) * 1000;
      console.log(`Rate limited. Retrying in ${backoffTime}ms...`);
      await sleep(backoffTime);
      return analyzeWithRetry(hand, modelType, attempt + 1);
    }
    console.error('Error analyzing poker hand:', error);
    throw error;
  }
}

async function analyzePokerHand(hand, modelType = 'grok') {
  try {
    const startTime = performance.now();
    const result = await analyzeWithRetry(hand, modelType);
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`Analysis completed in ${duration.toFixed(2)} seconds`);
    return result;
  } catch (error) {
    console.error('Failed to analyze hand after retries:', error);
    return JSON.stringify({
      tlDr: 'Analysis unavailable due to error',
      keyDecisions: [],
      considerations: [ 'Analysis skipped - please try again later' ],
      confidenceScore: 0
    });
  }
}

module.exports = {
  analyzePokerHand,
};
