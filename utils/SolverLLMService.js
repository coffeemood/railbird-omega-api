/**
 * SolverLLMService.js
 * 
 * Modern LLM service for poker hand analysis using OpenAI's Responses API
 * and structured output. Built following 2024/2025 best practices.
 */

require('dotenv').config()
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');
const SolverBlockTrimmer = require('./SolverBlockTrimmer');
const LLMPromptBuilder = require('./LLMPromptBuilder');

// Zod schema for structured poker analysis output
const MistakeSchema = z.object({
    text: z.string().describe("Brief description of the mistake"),
    evLoss: z.number().describe("EV loss in big blinds"),
    severity: z.number().min(0).max(100).describe("Mistake severity from 0-100")
});

const SnapshotAnalysisSchema = z.object({
    id: z.number().describe("Snapshot index starting from 0"),
    streetComment: z.string().max(250).describe("Street analysis with UI tags like <range hero>, <mix>, <blockers>"),
    mistake: MistakeSchema.nullable().describe("Mistake details if EV loss > 0.5BB, null otherwise")
});

const EnrichedHandAnalysisSchema = z.object({
    headline: z.string().max(30).describe("3-5 word catchy title"),
    tlDr: z.string().max(150).describe("One sentence summary of the hand"),
    handScore: z.number().min(0).max(100).describe("Overall hand score: 100 - (total EV loss * 10)"),
    snapshots: z.array(SnapshotAnalysisSchema).describe("Analysis for each street snapshot")
});

const GenerationSpecSchema = z.object({
    mainStrategicConcept: z.string().describe("The core lesson of the hand."),
    keyFocusTags: z.array(z.object({
        street: z.string().describe("The street name (FLOP, TURN, RIVER)"),
        tags: z.array(z.string()).describe("Array of tag strings to focus on")
    })).describe("An array of the 3-5 most important tags to focus on."),
    narrativeArc: z.string().describe("A brief plan for the explanation."),
    tone: z.string().describe("A coaching tone.")
});

class SolverLLMService {
    constructor(config = {}) {
        this.config = {
            defaultModel: config.defaultModel || 'openai',
            enableFallback: config.enableFallback !== false,
            enableMetrics: config.enableMetrics || false,
            temperature: config.temperature || 0.3,
            maxTokens: config.maxTokens || 1500,
            useTwoPhaseFlow: config.useTwoPhaseFlow !== undefined ? config.useTwoPhaseFlow : false, // Default to single-pass
            ...config
        };

        // Initialize providers
        this.providers = new Map();
        this.initializeProviders();

        // Initialize utilities
        this.trimmer = new SolverBlockTrimmer();
        this.promptBuilder = new LLMPromptBuilder({ useTagSystem: true });

        // Metrics tracking
        this.metrics = {
            totalRequests: 0,
            totalTokensUsed: 0,
            totalCost: 0,
            errorCount: 0,
            averageLatency: 0,
            providerUsage: {}
        };
    }

    /**
     * Initialize LLM providers with unified interface
     * @private
     */
    initializeProviders() {
        // OpenAI provider with Responses API
        if (process.env.OPENAI_API_KEY) {
            this.providers.set('openai', {
                name: 'openai',
                client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
                models: {
                    fast: 'gpt-4.1-nano',
                    // balanced: 'ft:gpt-4o-mini-2024-07-18:personal:my-gto-coach-3:B3O6rADI',
                    // balanced: 'ft:gpt-4o-mini-2024-07-18:personal::B1uEe3O1',
                    balanced: 'ft:gpt-4.1-mini-2025-04-14:personal:my-gto-coach-4:BuTrDY8t',
                    premium: 'ft:gpt-4.1-mini-2025-04-14:personal:my-gto-coach-4:BuTrDY8t'
                },
                costPer1K: { input: 0.005, output: 0.015 },
                supportsResponsesAPI: true,
                async analyze(prompt, options = {}) {
                    console.log('🤖 Starting OpenAI structured analysis...');
                    
                    const responseSchema = options.responseSchema || EnrichedHandAnalysisSchema;
                    const responseFormatName = options.responseSchema ? "generation_spec" : "poker_analysis";

                    // Use structured outputs with Zod schema for reliable parsing
                    const request = {
                        model: options.model || this.models.balanced,
                        // reasoning_effort: 'low',
                        messages: [
                            { role: 'system', content: prompt.system },
                            { role: 'user', content: prompt.user }
                        ],
                        temperature: options.temperature || 0.4,
                        max_tokens: options.maxTokens || 1000,
                        response_format: zodResponseFormat(responseSchema, responseFormatName)
                    };
                    if (request.model === 'o3') request.reasoning_effort = 'low';
                    if (request.model !== 'o3') request.temperature = 0.2;
                    const response = await this.client.chat.completions.create(request);

                    console.log(JSON.stringify(request.messages, null, 1));

                    const messageContent = response.choices[0].message.content;
                    
                    console.log('✅ OpenAI structured response received:', {
                        model: response.model,
                        usage: response.usage,
                        contentLength: messageContent.length,
                        contentPreview: messageContent.substring(0, 100) + '...'
                    });
                    
                    console.log('📊 Full response content:', messageContent);
                    
                    return {
                        content: messageContent,  // Return the JSON string directly
                        usage: response.usage,
                        model: response.model,
                        responseId: response.id
                    };
                }
            });
        }

        // Grok provider (fallback to chat completions)
        if (process.env.GROK_API_KEY) {
            this.providers.set('grok', {
                name: 'grok',
                client: new OpenAI({ 
                    apiKey: process.env.GROK_API_KEY,
                    baseURL: 'https://api.x.ai/v1'
                }),
                models: {
                    fast: 'grok-3-mini',
                    balanced: 'grok-3-mini',
                    premium: 'grok-3-mini'
                },
                costPer1K: { input: 0.001, output: 0.003 },
                supportsResponsesAPI: false,
                async analyze(prompt, options = {}) {
                    const response = await this.client.chat.completions.create({
                        model: options.model || this.models.balanced,
                        messages: [
                            { role: 'system', content: prompt.system },
                            { role: 'user', content: prompt.user }
                        ],
                        temperature: options.temperature || 0.3,
                        max_tokens: options.maxTokens || 1000
                    });
                    
                    return {
                        content: response.choices[0].message.content,
                        usage: response.usage,
                        model: response.model
                    };
                }
            });
        }

        // Mistral provider
        if (process.env.MISTRAL_API_KEY) {
            this.providers.set('mistral', {
                name: 'mistral',
                client: new OpenAI({
                    apiKey: process.env.MISTRAL_API_KEY,
                    baseURL: 'https://api.mistral.ai/v1'
                }),
                models: {
                    fast: 'mistral-small-latest',
                    balanced: 'ministral-8b-latest',
                    premium: 'mistral-large-latest'
                },
                costPer1K: { input: 0.002, output: 0.006 },
                supportsResponsesAPI: false,
                async analyze(prompt, options = {}) {
                    const response = await this.client.chat.completions.create({
                        model: options.model || this.models.balanced,
                        messages: [
                            { role: 'system', content: prompt.system },
                            { role: 'user', content: prompt.user }
                        ],
                        temperature: options.temperature || 0.3,
                        max_tokens: options.maxTokens || 1000
                    });
                    
                    return {
                        content: response.choices[0].message.content,
                        usage: response.usage,
                        model: response.model
                    };
                }
            });
        }

        // Google Gemini provider (fallback to generate content)
        if (process.env.GOOGLE_API_KEY) {
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
            this.providers.set('google', {
                name: 'google',
                client: genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }),
                models: {
                    fast: 'gemini-2.0-flash',
                    balanced: 'gemini-2.0-flash',
                    premium: 'gemini-2.0-flash'
                },
                costPer1K: { input: 0.002, output: 0.006 },
                supportsResponsesAPI: false,
                async analyze(prompt, options = {}) {
                    const fullPrompt = `${prompt.system}\n\n${prompt.user}`;
                    
                    const response = await this.client.generateContent({
                        contents: [{ parts: [{ text: fullPrompt }] }],
                        generationConfig: {
                            temperature: options.temperature || 0.3,
                            maxOutputTokens: options.maxTokens || 1000
                        }
                    });

                    return {
                        content: response.response.text(),
                        usage: { total_tokens: 0 }, // Gemini doesn't provide detailed usage
                        model: 'gemini-2.0-flash'
                    };
                }
            });
        }
    }

    /**
     * Main entry point - analyze hand with solver data
     * @param {Array} enrichedSnapshots - Snapshots with solver data
     * @param {Object} handData - Original hand data
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Complete EnrichedHandAnalysis
     */
    async analyzeHand(enrichedSnapshots, handData, options = {}) {
        const startTime = Date.now();
        
        try {
            // 1. Extract and format hand metadata
            const handMeta = this.extractHandMeta(handData);

            // 2. Trim solver blocks for token efficiency
            const trimmedSnapshots = this.trimSnapshots(enrichedSnapshots);

            // 3. Conditionally run the analysis phase based on configuration
            let generationSpec = null;
            if (this.config.useTwoPhaseFlow) {
                console.log('📊 Using two-phase flow with analysis step...');
                generationSpec = await this._runAnalysisPhase(handMeta, trimmedSnapshots, options);
            } else {
                console.log('⚡ Using single-pass flow...');
            }

            // 4. Build the main generation prompt (with or without spec)
            const prompt = this.promptBuilder.buildPrompt(handMeta, trimmedSnapshots, generationSpec);

            // Debug: Write prompt to file
            const fs = require('fs');
            fs.writeFileSync('/tmp/debug-prompt.json', JSON.stringify(prompt, null, 2));
            console.log('🔍 Generation prompt saved to /tmp/debug-prompt.json');

            // 5. Validate prompt
            const validation = this.promptBuilder.validatePrompt(prompt);
            if (!validation.isValid) {
                throw new Error(`Invalid prompt: ${validation.issues.join(', ')}`);
            }

            // 6. Select optimal provider for the main generation call
            const { provider, modelTier } = this.selectProvider(prompt, options);

            // 7. Call LLM for the main generation
            const llmResponse = await this.callLLMWithRetry(provider, prompt, {
                modelTier,
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens,
                responseSchema: EnrichedHandAnalysisSchema
            });

            // 8. Parse and validate structured response
            const parsedResponse = this.parseStructuredResponse(llmResponse.content, EnrichedHandAnalysisSchema);

            // 9. Merge with original data
            const enrichedAnalysis = this.mergeAnalysis(parsedResponse, enrichedSnapshots, handMeta);

            // 10. Track metrics
            this.updateMetrics(provider.name, Date.now() - startTime, llmResponse.usage);

            return enrichedAnalysis;

        } catch (error) {
            console.log(error);
            this.metrics.errorCount++;
            
            if (this.config.enableFallback) {
                return this.generateFallbackAnalysis(enrichedSnapshots, handData);
            }
            
            throw new Error(`LLM analysis failed: ${error.message}`);
        }
    }

    /**
     * Runs the initial analysis phase to generate a strategic plan.
     * @private
     */
    async _runAnalysisPhase(handMeta, trimmedSnapshots, options) {
        try {
            console.log('🧠 Starting analysis phase...');
            const analysisPrompt = this.promptBuilder.buildAnalysisPrompt(handMeta, trimmedSnapshots);

            // Use a fast and cheap model for the analysis phase
            const analysisOptions = { ...options, provider: 'openai', modelTier: 'fast' };
            const { provider, modelTier } = this.selectProvider(analysisPrompt, analysisOptions);

            const response = await this.callLLMWithRetry(provider, analysisPrompt, {
                modelTier,
                temperature: 0.1, // Low temperature for deterministic analysis
                maxTokens: 500,
                responseSchema: GenerationSpecSchema // Pass the correct schema for this phase
            });

            const generationSpec = this.parseStructuredResponse(response.content, GenerationSpecSchema);
            console.log('✅ Analysis phase complete. Generation spec:', generationSpec);
            return generationSpec;

        } catch (error) {
            console.warn(`⚠️ Analysis phase failed: ${error.message}. Proceeding without generation spec.`);
            // Return a null or default spec if the analysis phase fails
            return null;
        }
    }

    /**
     * Extract hand metadata from hand data
     * @param {Object} handData - Raw hand data
     * @returns {Object} Formatted hand metadata
     */
    extractHandMeta(handData) {
        return this.promptBuilder.formatHandMeta(handData);
    }

    /**
     * Trim all snapshots for LLM consumption
     * @param {Array} enrichedSnapshots - Snapshots with full solver data
     * @returns {Array} Snapshots with trimmed solver data
     */
    trimSnapshots(enrichedSnapshots) {
        return enrichedSnapshots.map(snapshot => ({
            ...snapshot,
            solver: this.trimmer.trimForLLM(snapshot.solver)
        }));
    }

    /**
     * Select optimal provider based on complexity and availability
     * @param {Object} prompt - Built prompt object
     * @param {Object} options - Selection options
     * @returns {Object} Selected provider and model tier
     */
    selectProvider(prompt, options = {}) {
        // Override provider if specified
        if (options.provider && this.providers.has(options.provider)) {
            return {
                provider: this.providers.get(options.provider),
                modelTier: options.modelTier || 'balanced'
            };
        }

        // Calculate complexity using prompt builder's estimation
        const estimatedTokens = this.promptBuilder.estimateTokens(prompt);
        const complexity = this.calculateComplexity(prompt);

        let selectedProvider, modelTier;

        // Prefer OpenAI with Responses API for best structured output
        if (this.providers.has('openai')) {
            selectedProvider = this.providers.get('openai');
            
            if (estimatedTokens < 2000 && complexity < 3) {
                modelTier = 'fast';
            } else if (estimatedTokens < 4000 && complexity <= 6) {
                modelTier = 'balanced';
            } else {
                modelTier = 'premium';
            }
        } else if (this.providers.has('mistral')) {
            // Fallback to Mistral for quality
            selectedProvider = this.providers.get('mistral');
            modelTier = 'balanced';
        } else if (this.providers.has('grok')) {
            // Fallback to Grok for cost efficiency
            selectedProvider = this.providers.get('grok');
            modelTier = 'balanced';
        } else if (this.providers.has('google')) {
            // Fallback to Google
            selectedProvider = this.providers.get('google');
            modelTier = 'balanced';
        } else {
            throw new Error('No LLM providers available');
        }

        return { provider: selectedProvider, modelTier };
    }

    /**
     * Calculate complexity score for provider selection
     * @param {Object} prompt - Built prompt object
     * @returns {number} Complexity score (1-10)
     */
    calculateComplexity(prompt) {
        try {
            // Parse user message to analyze solver data complexity
            const userObj = JSON.parse(prompt.user);
            const snapshots = userObj.solverSnapshots || [];
            
            const snapshotCount = snapshots.length;
            const hasComplexSolver = snapshots.some(s => 
                s.solver?.blockerImpact || s.solver?.handFeatures);
            const hasRangeData = snapshots.some(s => 
                s.solver?.heroRange || s.solver?.villainRange);
            
            let score = Math.min(snapshotCount, 5);
            if (hasComplexSolver) score += 2;
            if (hasRangeData) score += 1;
            if (snapshotCount > 6) score += 1;
            
            return score;
        } catch {
            return 5; // Default medium complexity
        }
    }

    /**
     * Call LLM with retry logic and error handling
     * @param {Object} provider - Provider instance
     * @param {Object} prompt - Built prompt object
     * @param {Object} options - Call options
     * @returns {Promise<Object>} LLM response
     */
    async callLLMWithRetry(provider, prompt, options = {}, attempt = 1) {
        const maxRetries = 3;
        
        try {
            const model = provider.models[options.modelTier] || provider.models.balanced;
            return await provider.analyze(prompt, {
                model,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                responseSchema: options.responseSchema
            });
        } catch (error) {
            console.log({ error })
            // Handle rate limiting
            if ((error.status === 429 || error.message.includes('rate limit')) && attempt < maxRetries) {
                const backoffMs = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                return this.callLLMWithRetry(provider, prompt, options, attempt + 1);
            }

            // Try fallback provider
            if (attempt === 1 && this.config.enableFallback) {
                const fallbackProvider = this.getFallbackProvider(provider.name);
                if (fallbackProvider) {
                    return this.callLLMWithRetry(fallbackProvider, prompt, options, 2);
                }
            }

            throw error;
        }
    }

    /**
     * Get fallback provider
     * @param {string} primaryProviderName - Primary provider that failed
     * @returns {Object|null} Fallback provider
     */
    getFallbackProvider(primaryProviderName) {
        const fallbackOrder = {
            'openai': ['mistral', 'grok', 'google'],
            'mistral': ['openai', 'grok', 'google'],
            'grok': ['openai', 'mistral', 'google'],
            'google': ['openai', 'mistral', 'grok']
        };

        const fallbacks = fallbackOrder[primaryProviderName] || [];
        for (const name of fallbacks) {
            if (this.providers.has(name)) {
                return this.providers.get(name);
            }
        }
        return null;
    }

    /**
     * Parse and validate structured JSON response
     * @param {string} content - Raw LLM response
     * @returns {Object} Parsed and validated response
     */
    parseStructuredResponse(content, schema = EnrichedHandAnalysisSchema) {
        try {
            // Clean up response (remove markdown if present)
            let jsonStr = content.trim();
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            const parsed = JSON.parse(jsonStr);
            
            // Validate required fields
            this.validateResponse(parsed, schema);
            
            return parsed;
        } catch (error) {
            throw new Error(`Failed to parse structured response: ${error.message}\nContent: ${content.substring(0, 200)}...`);
        }
    }

    /**
     * Validate parsed response structure
     * @param {Object} response - Parsed response
     * @throws {Error} If validation fails
     */
    validateResponse(response, schema = EnrichedHandAnalysisSchema) {
        try {
            schema.parse(response);
        } catch (error) {
            throw new Error(`Response validation failed: ${error.errors.map(e => e.message).join(', ')}`);
        }
    }

    /**
     * Merge LLM analysis with original snapshots
     * @param {Object} llmResponse - Parsed LLM response
     * @param {Array} originalSnapshots - Original enriched snapshots
     * @param {Object} handMeta - Hand metadata
     * @returns {Object} Complete EnrichedHandAnalysis
     */
    mergeAnalysis(llmResponse, originalSnapshots, handMeta) {
        const mergedSnapshots = originalSnapshots.map((originalSnapshot, index) => {
            const llmSnapshot = llmResponse.snapshots[index] || {};
            
            return {
                ...originalSnapshot,
                streetComment: llmSnapshot.streetComment || '',
                mistake: llmSnapshot.mistake || null
            };
        });

        return {
            handMeta,
            headline: llmResponse.headline,
            tlDr: llmResponse.tlDr,
            handScore: llmResponse.handScore,
            snapshots: mergedSnapshots,
            meta: {
                solverVersion: '1.0',
                llmModelUsed: this.config.defaultModel,
                generatedAt: new Date().toISOString(),
                apiVersion: 'responses-v1'
            }
        };
    }

    /**
     * Generate fallback analysis when LLM fails
     * @param {Array} enrichedSnapshots - Original snapshots
     * @param {Object} handData - Hand data
     * @returns {Object} Basic rule-based analysis
     */
    generateFallbackAnalysis(enrichedSnapshots, handData) {
        const handMeta = this.extractHandMeta(handData);
        
        const snapshots = enrichedSnapshots.map((snapshot, index) => ({
            ...snapshot,
            streetComment: 'Standard play based on solver data',
            mistake: null
        }));

        return {
            handMeta,
            headline: 'Analysis Generated',
            tlDr: 'Fallback analysis - LLM service unavailable',
            handScore: 75,
            snapshots,
            meta: {
                solverVersion: '1.0',
                llmModelUsed: 'fallback',
                generatedAt: new Date().toISOString(),
                isFallback: true
            }
        };
    }

    /**
     * Update performance metrics
     * @param {string} providerName - Provider name
     * @param {number} latencyMs - Request latency
     * @param {Object} usage - Token usage from provider
     */
    updateMetrics(providerName, latencyMs, usage = {}) {
        if (!this.config.enableMetrics) return;

        this.metrics.totalRequests++;
        this.metrics.totalTokensUsed += usage.total_tokens || 0;
        
        // Update provider-specific metrics
        if (!this.metrics.providerUsage[providerName]) {
            this.metrics.providerUsage[providerName] = { requests: 0, tokens: 0 };
        }
        this.metrics.providerUsage[providerName].requests++;
        this.metrics.providerUsage[providerName].tokens += usage.total_tokens || 0;

        // Update rolling average latency
        this.metrics.averageLatency = 
            (this.metrics.averageLatency * (this.metrics.totalRequests - 1) + latencyMs) / 
            this.metrics.totalRequests;
    }

    /**
     * Get performance metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Get available providers
     * @returns {Array} List of available provider names
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    /**
     * Estimate cost for analysis
     * @param {Array} enrichedSnapshots - Snapshots to analyze
     * @returns {Object} Cost estimation
     */
    estimateCost(enrichedSnapshots) {
        const handMeta = { handId: 'test', effStackBB: 100, blinds: {}, heroPos: 'BTN', heroCards: [], gameType: 'cash' };
        const trimmedSnapshots = this.trimSnapshots(enrichedSnapshots);
        const prompt = this.promptBuilder.buildPrompt(handMeta, trimmedSnapshots);
        const tokens = this.promptBuilder.estimateTokens(prompt);
        
        const { provider } = this.selectProvider(prompt);
        const estimatedCost = (tokens / 1000) * (provider.costPer1K.input + provider.costPer1K.output);
        
        return {
            estimatedTokens: tokens,
            provider: provider.name,
            estimatedCost: estimatedCost.toFixed(4),
            complexity: this.calculateComplexity(prompt)
        };
    }
}

module.exports = SolverLLMService;
