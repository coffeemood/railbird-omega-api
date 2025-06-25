/**
 * API Routes for poker hand analysis
 */
const router = require('express').Router();
const solvesCollection = require('../db/collections/Solves');
const Hands = require('../db/collections/Hands');

/**
 * @route GET /api/random
 * @desc Get a random hand analysis
 * @access Public
 */
router.get('/random', async (req, res) => {
  try {
    const analysis = await analysisService.getRandomHandAnalysis();
    res.json(analysis);
  } catch (error) {
    console.error('Error in random analysis endpoint:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route GET /api/node/:id
 * @desc Get a specific node by ID
 * @access Public
 */
router.get('/node/:id', async (req, res) => {
  try {
    const node = await solvesCollection.findOne({ _id: req.params.id });
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json(node);
  } catch (error) {
    console.error('Error in node retrieval endpoint:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route POST /api/analyze
 * @desc Analyze a specific hand in a specific node
 * @access Public
 * @body {nodeId, combo}
 */
router.post('/analyze', async (req, res) => {
  try {
    const { nodeId, combo } = req.body;
    
    if (!nodeId || !combo) {
      return res.status(400).json({ error: 'nodeId and combo are required' });
    }
    
    const node = await solvesCollection.findOne({ _id: nodeId });
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (!node.comboData[combo]) {
      return res.status(404).json({ error: 'Combo not found in node' });
    }
    
    const analysis = analysisService.analyzePokerHand(node, combo);
    res.json(analysis);
  } catch (error) {
    console.error('Error in analyze endpoint:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route GET /api/analyze/markdown
 * @desc Get markdown analysis for a random hand
 * @access Public
 */
router.get('/analyze/markdown', async (req, res) => {
  try {
    const analysis = await analysisService.getRandomHandAnalysis();
    res.send(analysis.analysisMarkdown);
  } catch (error) {
    console.error('Error in markdown analysis endpoint:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route POST /api/range
 * @desc Get full range data for visualization
 * @access Public
 * @body {nodeId, position}
 */
router.post('/range', async (req, res) => {
  try {
    const { nodeId, position } = req.body;
    
    if (!nodeId || !position) {
      return res.status(400).json({ error: 'nodeId and position are required' });
    }
    
    if (position !== 'ip' && position !== 'oop') {
      return res.status(400).json({ error: 'position must be either "ip" or "oop"' });
    }
    
    const node = await solvesCollection.findOneByQuery({ _id: nodeId });
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Get range data from the analysis service
    const rangeData = await analysisService.getRangeData(node, position);
    res.json(rangeData);
  } catch (error) {
    console.error('Error in range data endpoint:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route GET /api/hands
 * @desc Get up to 100 hands for testing HandReplayPage
 * @access Public
 * @query {limit} - Optional: Limit the number of hands returned (default: 100, max: 100)
 * @query {ownerId} - Optional: Filter hands by owner ID
 */
router.get('/hands', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    const query = {};
    
    // Add owner filter if provided
    if (req.query.ownerId) {
      query.ownerId = req.query.ownerId;
    }
    
    // Find hands with query and limit
    const hands = await Hands.findByQuery(query, { limit: limit });
    
    if (!hands || hands.length === 0) {
      return res.status(404).json({ error: 'No hands found' });
    }
    
    res.json({ 
      success: true,
      count: hands.length,
      hands
    });
  } catch (error) {
    console.error('Error fetching hands:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route POST /api/agent/chat
 * @desc Send a message history to the OpenAI agent and get a response, potentially using MCP tools.
 * @access Public (adjust access control as needed)
 * @body { messages: Array<OpenAI.Chat.ChatCompletionMessageParam> } - The conversation history.
 */
router.post('/agent/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Request body must contain a "messages" array.' });
    }

    // Basic validation of message structure (can be enhanced)
    if (messages.some(m => typeof m.role !== 'string' || (m.content && typeof m.content !== 'string'))) {
       return res.status(400).json({ error: 'Each message must have a "role" (string) and optional "content" (string).' });
    }

    // Call the agent service to process the conversation
    const result = await agentService.processConversation(messages);

    // Send back the full history and the final content
    res.json(result);

  } catch (error) {
    console.error('Error in /api/agent/chat endpoint:', error);
    res.status(500).json({ error: 'Server error processing agent chat', message: error instanceof Error ? error.message : String(error) });
  }
});


module.exports = router;
