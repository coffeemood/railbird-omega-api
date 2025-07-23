/**
 * Milestone Generation Service - Session timeline generation with cost-optimized LLM usage
 * Provides functions for generating session milestones including session boundaries and significant hands
 */

const { convertHandHistoryToText } = require('../utils/hand-utils');
const OpenAI = require('openai');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');
const moment = require('moment');
const pusher = require('../utils/pusher');
const { Mistral } = require('@mistralai/mistralai');

const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY
});

// Initialize LLM clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

/**
 * Filters hands for milestone generation based on significance criteria
 * @param {Array} hands - Array of hand objects
 * @returns {Array} - Filtered hands meeting milestone criteria
 */
function filterSignificantHands(hands) {
  return hands.filter(hand => {
    // Must be VPIP hand
    if (!hand.info?.isVPIP) return false;
    
    // Must have pot > 15bb OR hero is all-in
    const potBB = hand.totalPot?.bb || 0;
    const isHeroAllIn = hand.info?.isHeroAllIn || false;
    
    return potBB > 10 || isHeroAllIn;
  });
}

/**
 * Generates session start milestone
 * @param {Object} session - Session object from FileUploads
 * @returns {Object} - Session start milestone
 */
function generateSessionStartMilestone(session) {
  const startTime = moment(session.sessionStart).format('HH:mm');
  const gameType = session.gameType || 'Cash Game';
  
  return {
    title: "Session Started",
    time: startTime,
    type: "start",
    value: gameType,
    details: `Started playing ${gameType}${session.room && session.room.length > 0 ? ` at ${session.room[0]}` : ''}`
  };
}

/**
 * Generates session end milestone
 * @param {Object} session - Session object from FileUploads
 * @returns {Object} - Session end milestone
 */
function generateSessionEndMilestone(session) {
  const endTime = moment(session.sessionEnd).format('HH:mm');
  const winLoss = session.heroWinLoss || session.winning || '0';
  const isProfit = parseFloat(winLoss.replace(/[^0-9.-]/g, '')) > 0;
  
  return {
    title: "Session Ended",
    time: endTime,
    type: "end",
    value: winLoss.includes('$') ? winLoss : `${winLoss} BB`,
    details: `Session completed with ${isProfit ? 'profit' : 'loss'}`
  };
}

/**
 * Generates a milestone title for a significant hand using LLM (cost-optimized)
 * @param {Object} hand - Hand object
 * @param {string} modelType - LLM model to use ('openai', 'grok', 'cerebras')
 * @returns {Promise<Object>} - Generated milestone with title only from LLM
 */
async function generateHandMilestone(hand, modelType = 'cerebras') {
  try {
    const minimalText = convertHandHistoryToText(hand);
    
    // Cost optimization: Only generate title, compute all other fields
    const prompt = `You will be generating a brief milestone title for a poker hand. The hand details will be provided to you in the following format:

<poker_hand>
${minimalText}
</poker_hand>

To create an appropriate title, follow these guidelines:

1. Focus on the key outcome and significance of the hand
2. Use terms like "Big Win", "Tough Loss", "Cooler", "Good Fold", "Key Decision", 'Bleeding', 'Small Loss', 'Picking up a small pot'
3. Keep the title under 5 words
4. Do not use "hero" in the title
5. Only narrate from Hero's point of view
6. Do not label decisions as good or bad
7. Examples of appropriate titles: "Big Win with AA", "Tough Spot with KK", "Set Over Set Cooler"
ze the provided poker hand, paying attention to:
- Hero's starting hand
- Key actions and decisions throughout the hand
- The final outcome and BB won/lost

Based on your analysis, create a brief, impactful title that captures the essence of the hand. The title should be interesting and use varied wording, but avoid any hallucination or details not present in the hand history.

Output your title as plain text, without any additional commentary or explanation. Do not use any XML tags in your response.
`

    let result;
    
    switch (modelType) {
      case 'openai': {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 20
        });
        result = completion.choices[0].message.content.trim();
        break;
      }
      case 'grok': {
        const completion = await grok.chat.completions.create({
          model: 'grok-3-mini-beta',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 20
        });
        result = completion.choices[0].message.content.trim();
        break;
      }
      case 'cerebras': {
        const completionCreateResponse = await cerebras.chat.completions.create({
          messages: [
            {
              "role": "system",
              "content": "You are a poker expert that creates brief milestone titles. You do not think, you just generate the title. /no_think"
            },
            {
              "role": "user",
              "content": prompt
            }
          ],
          model: 'llama-4-scout-17b-16e-instruct',
          stream: false,
          max_completion_tokens: 20,
          temperature: 0.3
        });
        result = completionCreateResponse.choices[0].message.content.trim();
        break;
      }
      case 'mistral': {
        console.log(prompt)
        const completion = await mistral.chat.complete({
          model: 'mistral-small-latest', // or a specific model name if needed
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.4
        });
        result = completion.choices[0].message.content.trim();
        break;
      }
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }

    // Clean up the result (remove quotes if present)
    result = result.replace(/['"]/g, '').trim();
    
    // Compute all other milestone fields (no LLM cost)
    const heroChip = hand.playerChips?.find(pc => pc.hero);
    const winLossBB = heroChip?.winLossBB || 0;
    const handTime = moment(hand.header?.timestamp).format('HH:mm');
    const potBB = hand.totalPot?.bb || 0;
    
    // Determine milestone type based on outcome
    let type = 'event';
    if (winLossBB > 10) type = 'win';
    else if (winLossBB < -10) type = 'loss';
    
    // Generate value string
    const value = winLossBB > 0 ? `+${Math.abs(winLossBB).toFixed(0)} BB` : 
                  winLossBB < 0 ? `-${Math.abs(winLossBB).toFixed(0)} BB` : 
                  `${potBB.toFixed(0)} BB pot`;
    
    // Generate details
    const heroCards = `${hand.preflopSummary?.cards?.card1}${hand.preflopSummary?.cards?.card2}`;
    const position = hand.info?.heroPos || '';
    const details = `${heroCards} from ${position}, ${potBB.toFixed(0)}BB pot`;
    
    return {
      title: result,
      time: handTime,
      type: type,
      value: value,
      details: details,
      handId: hand._id
    };
    
  } catch (error) {
    console.error('Error generating hand milestone:', error);
    
    // Fallback milestone without LLM
    const heroChip = hand.playerChips?.find(pc => pc.hero);
    const winLossBB = heroChip?.winLossBB || 0;
    const handTime = moment(hand.header?.timestamp).format('HH:mm');
    const heroCards = `${hand.preflopSummary?.cards?.card1}${hand.preflopSummary?.cards?.card2}`;
    
    return {
      title: winLossBB > 0 ? `Win with ${heroCards}` : `Hand with ${heroCards}`,
      time: handTime,
      type: winLossBB > 0 ? 'win' : 'event',
      value: winLossBB > 0 ? `+${Math.abs(winLossBB).toFixed(0)} BB` : `${hand.totalPot?.bb?.toFixed(0) || 0} BB pot`,
      details: `${heroCards} from ${hand.info?.heroPos || ''}`,
      handId: hand._id
    };
  }
}

/**
 * Generates complete session milestones including session boundaries and significant hands
 * @param {Object} session - Session object from FileUploads
 * @param {Array} hands - Array of hand objects for the session
 * @param {string} modelType - LLM model to use for hand titles
 * @param {string} ownerId - Owner ID for Pusher channel
 * @returns {Promise<Array>} - Array of milestone objects
 */
async function generateSessionMilestones(session, hands, modelType = 'cerebras', ownerId = null) {
  const milestones = [];
  const sessionId = session._id;
  const pusherChannel = `milestones-${sessionId}`;
  
  // Send initial progress update
  if (ownerId) {
    await pusher.trigger(pusherChannel, 'milestone-progress', {
      sessionId,
      stage: 'starting',
      message: 'Starting milestone generation...',
      progress: 0
    });
  }
  
  // 1. Add session start milestone (no LLM cost)
  const startMilestone = generateSessionStartMilestone(session);
  milestones.push(startMilestone);
  
  if (ownerId) {
    await pusher.trigger(pusherChannel, 'milestone-created', {
      sessionId,
      milestone: startMilestone,
      type: 'session-start'
    });
  }
  
  // 2. Filter and process significant hands
  const significantHands = filterSignificantHands(hands);
  const totalSignificantHands = significantHands.length;
  
  // Sort by timestamp for chronological order
  significantHands.sort((a, b) => (a.header?.timestamp || 0) - (b.header?.timestamp || 0));
  
  if (ownerId) {
    await pusher.trigger(pusherChannel, 'milestone-progress', {
      sessionId,
      stage: 'processing-hands',
      message: `Processing ${totalSignificantHands} significant hands...`,
      progress: 10,
      totalHands: totalSignificantHands
    });
  }
  
  // 3. Generate hand milestones (LLM cost only for titles)
  for (let i = 0; i < significantHands.length; i++) {
    const hand = significantHands[i];
    try {
      const milestone = await generateHandMilestone(hand, modelType);
      milestones.push(milestone);
      
      // Send progress update
      if (ownerId) {
        const progress = 10 + Math.round((i + 1) / totalSignificantHands * 80); // 10-90% range
        await pusher.trigger(pusherChannel, 'milestone-progress', {
          sessionId,
          stage: 'processing-hands',
          message: `Generated milestone ${i + 1} of ${totalSignificantHands}`,
          progress,
          currentHand: i + 1,
          totalHands: totalSignificantHands
        });
        
        // Send individual milestone created event
        await pusher.trigger(pusherChannel, 'milestone-created', {
          sessionId,
          milestone,
          type: 'hand-milestone',
          handIndex: i + 1,
          totalHands: totalSignificantHands
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error generating milestone for hand ${hand._id}:`, error);
      
      if (ownerId) {
        await pusher.trigger(pusherChannel, 'milestone-error', {
          sessionId,
          handId: hand._id,
          error: error.message
        });
      }
    }
  }
  
  // 4. Add session end milestone (no LLM cost)
  const endMilestone = generateSessionEndMilestone(session);
  milestones.push(endMilestone);
  
  if (ownerId) {
    await pusher.trigger(pusherChannel, 'milestone-created', {
      sessionId,
      milestone: endMilestone,
      type: 'session-end'
    });
  }
  
  // Sort all milestones by time, but ensure session start/end are properly positioned
  milestones.sort((a, b) => {
    // Session start should always be first
    if (a.type === 'start') return -1;
    if (b.type === 'start') return 1;
    
    // Session end should always be last
    if (a.type === 'end') return 1;
    if (b.type === 'end') return -1;
    
    // For other milestones, sort by time
    const timeA = moment(a.time, 'HH:mm');
    const timeB = moment(b.time, 'HH:mm');
    return timeA.valueOf() - timeB.valueOf();
  });
  
  // Send completion update
  if (ownerId) {
    await pusher.trigger(pusherChannel, 'milestone-progress', {
      sessionId,
      stage: 'completed',
      message: `Generated ${milestones.length} milestones successfully!`,
      progress: 100,
      totalMilestones: milestones.length,
      significantHands: totalSignificantHands
    });
    
    await pusher.trigger(pusherChannel, 'milestones-completed', {
      sessionId,
      milestones,
      totalMilestones: milestones.length,
      significantHands: totalSignificantHands
    });
  }
  
  return milestones;
}

/**
 * Stores generated milestones in the database
 * @param {number} sessionId - Session ID
 * @param {Array} milestones - Array of milestone objects
 * @returns {Promise<void>}
 */
async function storeMilestones(sessionId, milestones) {
  const FileUploads = require('../db/collections/FileUploads');
  
  try {
    await FileUploads.updateById(sessionId, { milestones });
    console.log(`Stored ${milestones.length} milestones for session ${sessionId}`);
  } catch (error) {
    console.error(`Error storing milestones for session ${sessionId}:`, error);
    throw error;
  }
}

module.exports = {
  filterSignificantHands,
  generateSessionStartMilestone,
  generateSessionEndMilestone,
  generateHandMilestone,
  generateSessionMilestones,
  storeMilestones
};