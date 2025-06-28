/**
 * Title Generation Service - Implementation of Section 1.3 from the checklist
 * Provides functions for generating catchy titles for poker hands using LLM
 */

const { convertHandHistoryToText } = require('../utils/hand-utils');
const OpenAI = require('openai');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');

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

/**
 * Converts a parsed hand to minimal text format suitable for title generation
 * @param {Object} hand - Parsed hand object
 * @returns {string} - Minimal text representation
 */
function convertHandToMinimalText(hand) {
  const {
    header, preflopSummary, info, players
  } = hand;

  // console.log({hand});
  const formatBB = (amount) => (amount / header.bb).toFixed(1);
  const hero = hand.playerChips.find(p => p.hero);
  const heroCards = `${preflopSummary.cards.card1} ${preflopSummary.cards.card2}`;
  
  // Get basic action counts by street
  const actionCounts = {
    preflop: 0,
    flop: 0,
    turn: 0,
    river: 0
  };
  
  hand.actionScript.forEach(action => {
    if (!action.isNewStreet && action.action.type !== 'fold') {
      actionCounts[action.street]++;
    }
  });

  // Determine if hand went to showdown
  const wentToShowdown = actionCounts.river > 0 || (hand.riverSummary && hand.riverSummary.playersInvolved);
  
  // Get final board if available
  let finalBoard = '';
  if (hand.riverSummary && hand.riverSummary.board) {
    finalBoard = hand.riverSummary.board;
  } else if (hand.turnSummary && hand.turnSummary.board) {
    finalBoard = hand.turnSummary.board;
  } else if (hand.flopSummary && hand.flopSummary.board) {
    finalBoard = Array.isArray(hand.flopSummary.board) ? hand.flopSummary.board.join(' ') : hand.flopSummary.board;
  }

  // Get the street where action ended
  let lastStreet = 'preflop';
  if (actionCounts.river > 0) lastStreet = 'river';
  else if (actionCounts.turn > 0) lastStreet = 'turn';
  else if (actionCounts.flop > 0) lastStreet = 'flop';

  return `${info.effStack}BB ${header.gametype}: Hero (${info.heroPos}) with ${heroCards}, action to ${lastStreet}${finalBoard ? ` (${finalBoard})` : ''}${wentToShowdown ? ', showdown' : ''}, ${players.length} players`;
}

/**
 * Generates a catchy title for a poker hand using LLM
 * @param {Object} hand - Parsed hand object
 * @param {string} modelType - LLM model to use ('openai', 'grok')
 * @returns {Promise<string>} - Generated title
 */
async function generateHandTitle(hand, modelType = 'openai') {
  try {
    const minimalText = convertHandHistoryToText(hand);
    
    const prompt = `Give a tldr; title for this poker hand (max 8 words): ${minimalText}
    
Rules:
- Be creative and engaging
- Focus on the key events and outcome
- Do not invent facts, only use the information provided
- If the hand is not significant, dont try to make it interesting
- Keep it under 5 words
- Do not use the word "hero" in the title
- Always keep the hero's cards in the title, and postflop actions in the subtitle
- Keep hero's cards in the title using short hand like "AKs" or "JTo"

Examples of good titles:
- "Big Win with AA"
- "Tough Spot with KK"
- "Set Over Set Cooler Spot"
- "Tough fold to Aggression"
- "Thin Value Bet Pays Off"

Return strict JSON { title: string, subtitle: string }, nothing else.`;

    let result;
    
    switch (modelType) {
      case 'openai': {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 50
        });
        result = completion.choices[0].message.content.trim();
        const tokenUsage = completion.usage;
        console.log({tokenUsage});
        break;
      }
      case 'grok': {
        const completion = await grok.chat.completions.create({
          model: 'grok-3-mini-beta',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 50
        });
        result = completion.choices[0].message.content.trim();
        break;
      }
      case 'cerebras': {
        const completionCreateResponse = await cerebras.chat.completions.create({
          messages: [
            {
              "role": "system",
              "content": ""
            },
            {
              "role": "user",
              "content": prompt
            }
          ],
          model: 'llama3.1-8b',
          stream: false,
          max_completion_tokens: 2048,
          temperature: 0.5,
          response_format: { type: "json_object" }
        });
        result = completionCreateResponse.choices[0].message.content.trim();
        break;
      }
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }

    // Clean up the result (remove quotes if present)
    result = result.replace(/```json\n|\n```/g, '');
    const parsedResult = JSON.parse(result);
    
    return parsedResult;
  } catch (error) {
    console.error('Error generating hand title:', error);
    // Fallback to a simple descriptive title
    const heroCards = `${hand.preflopSummary.cards.card1}${hand.preflopSummary.cards.card2}`;
    const position = hand.info.heroPos;
    return `${heroCards} from ${position}`;
  }
}

/**
 * Generates titles for multiple hands in batch
 * @param {Array} hands - Array of parsed hand objects
 * @param {string} modelType - LLM model to use
 * @returns {Promise<Array>} - Array of HandTitle objects
 */
async function generateHandTitles(hands, modelType = 'openai') {
  const titles = [];
  
  for (const hand of hands) {
    try {
      const title = await generateHandTitle(hand, modelType);
      console.log({title});
      titles.push({
        handId: hand._id,
        title: title.title,
        subtitle: title.subtitle
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error generating title for hand ${hand._id}:`, error);
      // Add fallback title
      titles.push({
        handId: hand._id,
        title: `Hand ${hand.indexInCollection || titles.length + 1}`,
        subtitle: ''
      });
    }
  }
  
  return titles;
}

/**
 * Stores generated titles in the database
 * @param {Array} handTitles - Array of HandTitle objects
 * @returns {Promise<void>}
 */
async function storeHandTitles(handTitles) {
  const Hands = require('../db/collections/Hands');
  
  for (const handTitle of handTitles) {
    try {
      await Hands.updateById(
        handTitle.handId,
        { title: handTitle.title, subtitle: handTitle.subtitle }
      );
    } catch (error) {
      console.error(`Error storing title for hand ${handTitle.handId}:`, error);
    }
  }
}

module.exports = {
  convertHandToMinimalText,
  generateHandTitle,
  generateHandTitles,
  storeHandTitles
};