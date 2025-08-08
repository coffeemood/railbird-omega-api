/**
 * SolverLLMService.js
 * 
 * Modern LLM service for poker hand analysis using OpenAI's Responses API
 * and structured output. Built following 2024/2025 best practices.
 */

require('dotenv').config()
const OpenAI = require('openai');
const { z } = require('zod');
const { zodTextFormat } = require('openai/helpers/zod');
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
  streetComment: z.string().describe("Street analysis with UI tags like <range hero>, <mix>, <blockers>"),
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
  })).describe("An array of the 3-5 most important tags to focus on.").optional(),
  analysis: z.array(z.any()).describe("Alternative analysis structure from non-OpenAI providers").optional(),
  narrativeArc: z.string().describe("A brief plan for the explanation."),
  tone: z.string().describe("A coaching tone.")
});

class SolverLLMService {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultModel || 'fireworks', // defaultModel is actually the provider name
      analysisProvider: config.analysisProvider || 'fireworks', // Provider for analysis phase
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
              fast: 'gpt-5-mini',
              // balanced: 'ft:gpt-4o-mini-2024-07-18:personal:my-gto-coach-3:B3O6rADI',
              // balanced: 'ft:gpt-4o-mini-2024-07-18:personal::B1uEe3O1',
              balanced: 'gpt-5-mini',
              premium: 'gpt-5'
          },
          costPer1M: { input: 0.8, output: 3.2 }, // Fine-tuned GPT pricing per 1M tokens
          supportsResponsesAPI: true,
          async analyze(prompt, options = {}) {
            console.log('🤖 Starting OpenAI structured analysis...');
            
            const responseSchema = options.responseSchema || EnrichedHandAnalysisSchema;
            const responseFormatName = options.responseSchema ? "generation_spec" : "poker_analysis";

            // Use structured outputs with Zod schema for reliable parsing
            const request = {
              model: options.model || this.models.balanced,
              input: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user }
              ],
              text: {
                format: zodTextFormat(responseSchema, responseFormatName),
                verbosity: 'low'
              },
              reasoning: {
                effort: "minimal",
              }
            };

            const response = await this.client.responses.create(request);
            
            console.log(JSON.stringify(request.messages, null, 1));
            console.log(response)

            const messageContent = response.output_text;
            
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
            costPer1M: { input: 1.0, output: 3.0 },
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
            costPer1M: { input: 2.0, output: 6.0 },
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

    // Fireworks AI provider
    if (process.env.FIREWORKS_API_KEY) {
        this.providers.set('fireworks', {
            name: 'fireworks',
            client: new OpenAI({ 
                apiKey: process.env.FIREWORKS_API_KEY,
                baseURL: 'https://api.fireworks.ai/inference/v1'
            }),
            models: {
                fast: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
                balanced: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
                premium: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507'
            },
            costPer1M: { input: 0.22, output: 0.88 }, // Qwen pricing per 1M tokens
            supportsResponsesAPI: false,
            async analyze(prompt, options = {}) {
                const request = {
                    model: options.model || this.models.balanced,
                    messages: [
                        { role: 'system', content: prompt.system },
                        { role: 'user', content: prompt.user }
                    ],
                    temperature: options.temperature || 0.6,
                    max_tokens: options.maxTokens || 4096,
                    top_p: 1,
                    top_k: 40,
                    presence_penalty: 0,
                    frequency_penalty: 0
                }
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
                    content: response.choices[0].message.content,
                    usage: response.usage,
                    model: response.model
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

            return { enrichedAnalysis, generationSpec };

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

            // Use configured provider for the analysis phase
            const analysisOptions = { ...options, provider: this.config.analysisProvider, modelTier: 'fast' };
            const { provider, modelTier } = this.selectProvider(analysisPrompt, analysisOptions);

            const response = await this.callLLMWithRetry(provider, analysisPrompt, {
                modelTier,
                temperature: 0.1, // Low temperature for deterministic analysis
                maxTokens: 1500,
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

        // Try to use the configured default provider first
        if (this.providers.has(this.config.defaultProvider)) {
            selectedProvider = this.providers.get(this.config.defaultProvider);
            
            if (estimatedTokens < 2000 && complexity < 3) {
                modelTier = 'fast';
            } else if (estimatedTokens < 4000 && complexity <= 6) {
                modelTier = 'balanced';
            } else {
                modelTier = 'premium';
            }
        } else if (this.providers.has('fireworks')) {
            // First fallback: Fireworks for cost efficiency
            selectedProvider = this.providers.get('fireworks');
            modelTier = 'balanced';
        } else if (this.providers.has('openai')) {
            // Second fallback: OpenAI with Responses API for best structured output
            selectedProvider = this.providers.get('openai');
            modelTier = 'balanced';
        } else if (this.providers.has('mistral')) {
            // Third fallback: Mistral for quality
            selectedProvider = this.providers.get('mistral');
            modelTier = 'balanced';
        } else if (this.providers.has('grok')) {
            // Fourth fallback: Grok for cost efficiency
            selectedProvider = this.providers.get('grok');
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
            'fireworks': ['openai', 'mistral', 'grok'],
            'openai': ['fireworks', 'mistral', 'grok'],
            'mistral': ['fireworks', 'openai', 'grok'],
            'grok': ['fireworks', 'openai', 'mistral']
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
                llmModelUsed: this.config.defaultProvider,
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
        
        // Calculate cost based on provider pricing
        const provider = this.providers.get(providerName);
        let requestCost = 0;
        if (provider && provider.costPer1M && usage.prompt_tokens && usage.completion_tokens) {
            const inputCost = (usage.prompt_tokens / 1000000) * provider.costPer1M.input;
            const outputCost = (usage.completion_tokens / 1000000) * provider.costPer1M.output;
            requestCost = inputCost + outputCost;
            this.metrics.totalCost += requestCost;
        }
        
        // Update provider-specific metrics
        if (!this.metrics.providerUsage[providerName]) {
            this.metrics.providerUsage[providerName] = { requests: 0, tokens: 0, cost: 0 };
        }
        this.metrics.providerUsage[providerName].requests++;
        this.metrics.providerUsage[providerName].tokens += usage.total_tokens || 0;
        this.metrics.providerUsage[providerName].cost += requestCost;

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
        // Estimate cost assuming 70% input, 30% output token distribution
        const estimatedInputTokens = tokens * 0.7;
        const estimatedOutputTokens = tokens * 0.3;
        const estimatedCost = provider.costPer1M ? 
            (estimatedInputTokens / 1000000) * provider.costPer1M.input + 
            (estimatedOutputTokens / 1000000) * provider.costPer1M.output :
            0;
        
        return {
            estimatedTokens: tokens,
            provider: provider.name,
            estimatedCost: estimatedCost.toFixed(4),
            complexity: this.calculateComplexity(prompt)
        };
    }
}

module.exports = SolverLLMService;
