/**
 * CoachLLMService.js
 * 
 * Specialized LLM service for poker coaching conversations.
 * Handles context management, coaching-specific prompts, and chat continuity.
 */

require('dotenv').config();
const OpenAI = require('openai');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');
const CoachChats = require('../db/collections/CoachChats');

// Zod schema for coaching responses
const CoachingResponseSchema = z.object({
    content: z.string().describe("The coaching response addressing the user's question"),
    references: z.array(z.object({
        snapshotIndex: z.number().describe("Index of snapshot being referenced"),
        context: z.string().describe("Brief context about why this snapshot is relevant")
    })).optional().describe("References to specific snapshots if relevant"),
    suggestedFollowUp: z.string().optional().describe("Optional follow-up question to continue the coaching conversation")
});

class CoachLLMService {
    constructor(config = {}) {
        this.config = {
            temperature: config.temperature || 0.6, // Higher for more conversational
            maxTokens: config.maxTokens || 2500,
            maxContextTokens: config.maxContextTokens || 8000, // Reserve tokens for response
            maxMessagesInContext: config.maxMessagesInContext || 10,
            provider: config.provider || 'fireworks', // Default to Fireworks
            enableFallback: config.enableFallback !== false,
            ...config
        };

        // Initialize providers
        this.initializeProviders();
        
        // Set models
        this.fireworksModel = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507';
        this.openaiModel = 'ft:gpt-4.1-mini-2025-04-14:personal:my-gto-coach-4:BuTrDY8t';

        // Coaching-specific system prompt
        this.systemPrompt = `You are an expert poker coach having a conversation about a specific hand with a student. 

Your coaching style:
- Be conversational and encouraging, like a patient mentor
- Reference specific solver data and snapshots when relevant  
- Ask follow-up questions to deepen understanding
- Explain the "why" behind decisions, not just what to do
- Use natural poker language that players actually use
- Connect concepts to broader strategic principles

Context:
- You have access to the full hand analysis and all decision points (snapshots)
- You can reference specific streets, actions, and solver recommendations
- The student may ask about specific decisions or general strategy
- Build on the conversation history to provide personalized coaching

Response guidelines:
- Keep responses focused and conversational (2-4 sentences typically)
- Reference specific solver data when it supports your point
- If referencing snapshots, include the snapshot index in your response
- End with a question or observation to continue the dialogue when appropriate
- Be specific about pot sizes, stack depths, and board textures when relevant`;
    }

    /**
     * Initialize LLM providers
     * @private
     */
    initializeProviders() {
        this.providers = new Map();

        // Fireworks provider (primary)
        if (process.env.FIREWORKS_API_KEY) {
            this.providers.set('fireworks', {
                name: 'fireworks',
                client: new OpenAI({ 
                    apiKey: process.env.FIREWORKS_API_KEY,
                    baseURL: 'https://api.fireworks.ai/inference/v1'
                }),
                model: this.fireworksModel,
                supportsStructured: false
            });
        }

        // OpenAI provider (fallback)
        if (process.env.OPENAI_API_KEY) {
            this.providers.set('openai', {
                name: 'openai',
                client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
                model: this.openaiModel,
                supportsStructured: true
            });
        }
    }

    /**
     * Continue a coaching conversation
     * @param {String} chatId - The chat ID
     * @param {String} newMessage - User's new message
     * @param {Number} focusSnapshot - Optional snapshot index the question relates to
     * @returns {Promise<Object>} Coaching response
     */
    async continueCoaching(chatId, newMessage, focusSnapshot = null) {
        const startTime = Date.now();
        
        try {
            // Load the chat context
            const context = await this.buildCoachingContext(chatId, focusSnapshot);
            
            // Build the conversation messages
            const messages = this.buildConversationMessages(context, newMessage);
            
            // Get LLM response
            const response = await this.getLLMResponse(messages);
            
            // Add both user message and assistant response to the chat
            await CoachChats.addMessage(chatId, {
                role: 'user',
                content: newMessage,
                timestamp: new Date(),
                metadata: { focusSnapshot }
            });

            await CoachChats.addMessage(chatId, {
                role: 'assistant',
                content: response.content,
                timestamp: new Date(),
                metadata: {
                    model: response.model,
                    provider: response.provider,
                    tokenUsage: response.usage,
                    references: response.references,
                    latencyMs: Date.now() - startTime
                }
            });

            return {
                content: response.content,
                references: response.references,
                suggestedFollowUp: response.suggestedFollowUp,
                metadata: {
                    tokenUsage: response.usage,
                    latencyMs: Date.now() - startTime
                }
            };

        } catch (error) {
            console.error('Error in coaching conversation:', error);
            throw new Error(`Coaching failed: ${error.message}`);
        }
    }

    /**
     * Build coaching context for the conversation
     * @param {String} chatId - The chat ID
     * @param {Number} focusSnapshot - Optional snapshot to focus on
     * @returns {Promise<Object>} Context object with relevant data
     */
    async buildCoachingContext(chatId, focusSnapshot = null) {
        const chat = await CoachChats.findById(chatId);
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        // Get recent messages for context
        const recentMessages = await CoachChats.getRecentMessages(chatId, this.config.maxMessagesInContext);
        
        // Extract hand data and snapshots from the original user message
        let handData = null;
        let snapshots = [];
        
        const originalUserMessage = chat.messages.find(msg => msg.role === 'user');
        if (originalUserMessage && originalUserMessage.content && typeof originalUserMessage.content === 'object') {
            handData = originalUserMessage.content.handMeta;
            snapshots = originalUserMessage.content.solverSnapshots || [];
        }

        return {
            chatId,
            handData,
            snapshots,
            recentMessages,
            focusSnapshot,
            totalMessages: chat.messages.length
        };
    }

    /**
     * Build conversation messages for the LLM
     * @param {Object} context - Context from buildCoachingContext
     * @param {String} newMessage - New user message
     * @returns {Array} Array of messages for LLM
     */
    buildConversationMessages(context, newMessage) {
        const messages = [
            { role: 'system', content: this.systemPrompt }
        ];

        // Add hand context if this is early in the conversation
        if (context.totalMessages <= 5 && context.handData) {
            messages.push({
                role: 'system',
                content: `Hand Context: ${JSON.stringify({
                    handMeta: context.handData,
                    snapshots: context.snapshots.map((s, i) => ({
                        index: i,
                        street: s.street,
                        board: s.board,
                        potBB: s.potBB,
                        heroAction: s.heroAction,
                        tags: s.solverTags || []
                    }))
                })}`
            });
        }

        // Add recent conversation history (excluding system messages)
        const conversationHistory = context.recentMessages
            .filter(msg => msg.role !== 'system')
            .slice(-6); // Last 6 messages for context

        conversationHistory.forEach(msg => {
            messages.push({
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            });
        });

        // Add focus snapshot context if specified
        if (context.focusSnapshot !== null && context.snapshots[context.focusSnapshot]) {
            const snapshot = context.snapshots[context.focusSnapshot];
            messages.push({
                role: 'system',
                content: `User is asking about snapshot ${context.focusSnapshot} (${snapshot.street}): ${JSON.stringify({
                    street: snapshot.street,
                    board: snapshot.board,
                    potBB: snapshot.potBB,
                    heroAction: snapshot.heroAction,
                    tags: snapshot.solverTags || []
                })}`
            });
        }

        // Add the new user message
        messages.push({
            role: 'user',
            content: newMessage
        });

        return messages;
    }

    /**
     * Get response from LLM with provider fallback
     * @param {Array} messages - Conversation messages
     * @returns {Promise<Object>} LLM response
     */
    async getLLMResponse(messages) {
        // Try primary provider (Fireworks)
        const primaryProvider = this.providers.get(this.config.provider || 'fireworks');
        if (primaryProvider) {
            console.log({ primaryProvider })
            try {
                return await this.callProvider(primaryProvider, messages);
            } catch (error) {
                console.error(`Primary provider (${this.config.provider}) failed:`, error.message);
                
                // Try fallback if enabled
                if (this.config.enableFallback) {
                    const fallbackProvider = this.providers.get('openai');
                    if (fallbackProvider) {
                        console.log('🔄 Falling back to OpenAI...');
                        return await this.callProvider(fallbackProvider, messages);
                    }
                }
                throw error;
            }
        }

        throw new Error('No available providers configured');
    }

    /**
     * Call specific provider with appropriate configuration
     * @param {Object} provider - Provider configuration
     * @param {Array} messages - Conversation messages
     * @returns {Promise<Object>} LLM response
     */
    async callProvider(provider, messages) {
        if (provider.supportsStructured) {
            // OpenAI with structured output
            try {
                const response = await provider.client.chat.completions.create({
                    model: provider.model,
                    messages: messages,
                    temperature: this.config.temperature,
                    max_tokens: this.config.maxTokens,
                    response_format: zodResponseFormat(CoachingResponseSchema, "coaching_response")
                });

                const messageContent = response.choices[0].message.content;
                const parsedContent = JSON.parse(messageContent);

                console.log(`✅ ${provider.name} structured response:`, {
                    model: response.model,
                    usage: response.usage,
                    contentLength: messageContent.length
                });

                return {
                    content: parsedContent.content,
                    references: parsedContent.references || [],
                    suggestedFollowUp: parsedContent.suggestedFollowUp,
                    usage: response.usage,
                    model: response.model,
                    provider: provider.name
                };
            } catch (structuredError) {
                console.log('Structured output failed, falling back to regular chat...');
                // Fall through to regular chat completion
            }
        }

        // Regular chat completion (Fireworks or OpenAI fallback)
        const requestConfig = {
            model: this.fireworksModel,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
        };

        const response = await provider.client.chat.completions.create(requestConfig);

        console.log(`✅ ${provider.name} response:`, {
            model: response.model,
            usage: response.usage,
            contentLength: response.choices[0].message.content.length
        });

        return {
            content: response.choices[0].message.content,
            references: [],
            suggestedFollowUp: null,
            usage: response.usage,
            model: response.model,
            provider: provider.name
        };
    }

    /**
     * Create initial coaching chat from analysis
     * @param {String} handId - The hand ID
     * @param {String} userId - The user ID
     * @param {Object} handMeta - Hand metadata
     * @param {Array} snapshots - Enriched snapshots with tags
     * @param {Object} analysis - Initial analysis result
     * @param {Object} analysisMetadata - Metadata from SolverLLMService (model, provider, etc.)
     * @returns {Promise<String>} Created chat ID
     */
    async createInitialCoachingChat(handId, userId, handMeta, actionHistory, snapshots, analysis, analysisMetadata = {}) {
        const now = new Date();
        
        const initialMessages = [
            {
                role: 'system',
                content: this.systemPrompt,
                timestamp: now
            },
            {
                role: 'user',
                content: JSON.stringify({
                    handMeta,
                    actionHistory,
                    solverSnapshots: snapshots
                }),
                timestamp: now,
                metadata: { focusSnapshot: null }
            },
            {
                role: 'assistant',
                content: JSON.stringify(analysis),
                timestamp: now,
                metadata: {
                    ...analysisMetadata, // Use actual analysis metadata (model, provider, etc.)
                    isInitialAnalysis: true
                }
            }
        ];

        const chat = await CoachChats.createChatForHand(handId, userId, initialMessages);
        return chat;
    }

    /**
     * Get coaching metrics
     * @returns {Object} Service metrics
     */
    getMetrics() {
        return {
            service: 'CoachLLMService',
            model: this.model,
            config: {
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens,
                maxContextTokens: this.config.maxContextTokens
            }
        };
    }
}

module.exports = CoachLLMService;