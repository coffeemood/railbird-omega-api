const Collection = require('../collection');
const SuperCollection = require('./common/supercollection');
const { ID } = require('./common/datatype');

// CoachChats collection
const coachChatsCollection = new Collection('coach-chats', { autoIncrementId: 'coach-chats', autoIncrementPrefix: 10 });

/**
 * CoachChats Schema - Stores coaching conversations for specific hands
 */
const coachChatsSchema = {
  handId: String, // References Hands._id
  userId: String, // Owner of the chat
  messages: Array, // Array of message objects
  contextSummary: Object, // Cached summary for long chats to manage token limits
  createdAt: Number,
  updatedAt: Number,
};

/**
 * CoachChats Relation Maps
 */
const coachChatsRelationMaps = [
];

/**
 * CoachChats Public Fields
 * Fields that can be passed to public endpoints
 */
const coachChatsPublicFields = {
  _id: 1,
  handId: 1,
  userId: 1,
  messages: 1,
  createdAt: 1,
  updatedAt: 1,
};

class CoachChats extends SuperCollection {
  constructor() {
    super(coachChatsCollection, coachChatsSchema, coachChatsRelationMaps, coachChatsPublicFields);
  }

  /**
   * Create a new coaching chat for a hand
   * @param {String} handId - The hand ID
   * @param {String} userId - The user ID
   * @param {Array} initialMessages - Array of initial messages
   * @returns {Promise<Object>} Created chat document
   */
  async createChatForHand(handId, userId, initialMessages = []) {
    const now = Date.now();
    const chatData = {
      handId,
      userId,
      messages: initialMessages,
      contextSummary: null,
      createdAt: now,
      updatedAt: now,
    };

    return await this.insert(chatData);
  }

  /**
   * Add a message to an existing chat
   * @param {String} chatId - The chat ID
   * @param {Object} message - Message object with role, content, timestamp, metadata
   * @returns {Promise<Object>} Updated chat document
   */
  async addMessage(chatId, message) {
    const chat = await this.findById(chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    // Add timestamp if not provided
    if (!message.timestamp) {
      message.timestamp = new Date();
    }

    chat.messages.push(message);
    chat.updatedAt = Date.now();

    await this.updateById(chatId, {
      messages: chat.messages,
      updatedAt: chat.updatedAt
    });

    return chat;
  }

  /**
   * Get chat by hand ID and user ID
   * @param {String} handId - The hand ID
   * @param {String} userId - The user ID
   * @returns {Promise<Object|null>} Chat document or null
   */
  async findByHandAndUser(handId, userId) {
    return await this.findOneByQuery({ handId, userId });
  }

  /**
   * Update context summary for long chats
   * @param {String} chatId - The chat ID
   * @param {String} summary - Context summary
   * @returns {Promise<Object>} Updated chat document
   */
  async updateContextSummary(chatId, summary) {
    const updateData = {
      contextSummary: {
        lastSummarized: new Date(),
        summary: summary
      },
      updatedAt: Date.now()
    };

    return await this.updateById(chatId, updateData);
  }

  /**
   * Get recent messages from a chat (for context building)
   * @param {String} chatId - The chat ID
   * @param {Number} limit - Maximum number of recent messages
   * @returns {Promise<Array>} Array of recent messages
   */
  async getRecentMessages(chatId, limit = 10) {
    const chat = await this.findById(chatId);
    if (!chat || !chat.messages) {
      return [];
    }

    // Return the last N messages
    return chat.messages.slice(-limit);
  }

  /**
   * Check if chat needs context compression
   * @param {String} chatId - The chat ID
   * @param {Number} maxMessages - Maximum messages before compression
   * @returns {Promise<Boolean>} Whether compression is needed
   */
  async needsContextCompression(chatId, maxMessages = 20) {
    const chat = await this.findById(chatId);
    return chat && chat.messages && chat.messages.length > maxMessages;
  }
}

module.exports = new CoachChats();