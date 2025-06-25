/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
/* eslint-disable no-await-in-loop, max-len */
const moment = require('moment');
const mongo = require('./mongo');

class Collection {
  /**
   * Init collection
   * @param {string} name: collection name
   * @param {object} settings: collection settings
   * {
   *  - defaultHook {boolean}: add createdAt, createdBy, modifiedAt, modifiedBy while insert or update
   *  - autoIncrement {boolean}: create an autoincrement id in auto-increment collection
   *  - autoIncrementId {string}: auto increment id, will use collection name if not provided
   *  - autoIncrementInit {number}: auto increment init number, default: 100
   *  - autoIncrementPrefix {number}: prefix id to identify collection, to be merged with auto increment id
   * }
   */
  constructor(name,
    {
      defaultHook = true, autoIncrement = true, autoIncrementId = undefined, autoIncrementInit = 100, autoIncrementPrefix = ''
    } = {}) {
    this.mongo = mongo;
    this.name = name;
    this.settings = {
      defaultHook,
      autoIncrement,
      autoIncrementId: autoIncrementId || name,
    };
    this.autoIncrementInit = autoIncrementInit;
    this.autoIncrementPrefix = autoIncrementPrefix;
    
    // Defer database operations until needed
    this.dbInitialized = false;
    this.initPromise = null;
  }

  // Initialize db connection with retry mechanism
  async ensureDbConnection() {
    if (this.dbInitialized) return;
    
    if (!this.initPromise) {
      this.initPromise = new Promise(async (resolve, reject) => {
        let retries = 0;
        const maxRetries = 5;
        const retryInterval = 1000; // 1 second

        const tryInitialize = async () => {
          try {
            if (!this.mongo.isInitialized) {
              // Wait for MongoDB to initialize
              await this.mongo.init();
            }
            
            this.db = this.mongo.db();
            this.collection = this.db.collection(this.name);
            
            // Initialize auto-increment if needed
            if (this.settings.autoIncrement) {
              await this.db.collection('auto-increment').findOneAndUpdate(
                { _id: this.settings.autoIncrementId },
                { $setOnInsert: { number: this.autoIncrementInit, prefix: this.autoIncrementPrefix } },
                { upsert: true },
              );
            }
            
            this.dbInitialized = true;
            resolve();
          } catch (error) {
            retries++;
            if (retries >= maxRetries) {
              console.error(`Failed to connect to MongoDB after ${maxRetries} attempts:`, error);
              reject(error);
              return;
            }
            
            console.log(`MongoDB not ready yet. Retry attempt ${retries}/${maxRetries} in ${retryInterval}ms...`);
            setTimeout(tryInitialize, retryInterval);
          }
        };
        
        tryInitialize();
      });
    }
    
    return this.initPromise;
  }

  /* -------------------- Collection Helper Methods -------------------- */
  /**
   * Get next auto increment id
   * @param {string} autoIncrementId: auto increment id
   */
  async getAutoIncrementId(autoIncrementId) {
    await this.ensureDbConnection();
    const result = await this.db.collection('auto-increment').findOneAndUpdate(
      { _id: autoIncrementId },
      { $inc: { number: 1 } },
      { upsert: true, new: true },
    );
    return parseInt(`${result.value.prefix}${result.value.number}`);
  }

  /**
   * Verify or generate doc _id
   * - Ensure _id is provided with positive number if not using autoIncrement
   * - Auto generate doc _id if using autoIncrement
   * @param {*} doc
   */
  async verifyOrGenerateId(doc) {
    if (!this.settings.autoIncrement && !doc._id) throw new Error('_id field is missing, collection without auto increment must provide _id field while inserting document');
    if (doc._id && (!Number.isInteger(doc._id) || doc._id <= 0)) throw new Error('_id field must be a positive integer for inserting document');
    if (!doc._id) doc._id = await this.getAutoIncrementId(this.settings.autoIncrementId);
    return doc._id;
  }

  /* -------------------- Mongo Collection Methods -------------------- */
  /**
   * Raw collection
   */
  async raw() {
    await this.ensureDbConnection();
    return this.collection;
  }

  /**
   * Insert One
   * @param {object} doc: document to insert
   * @param {object} [options]: optional settings
   */
  async insertOne(doc, options) {
    await this.ensureDbConnection();
    if (this.settings.defaultHook) {
      // TODO: ADD USER ID HERE
      // const userId = Account.userId();
      // if (userId) doc.createdBy = userId;
      doc.createdAt = moment().valueOf();
    }
    doc._id = await this.verifyOrGenerateId(doc);
    return this.collection.insertOne(doc, options);
  }

  /**
   * Insert Many
   * @param {array<object>} docs: documents to insert
   * @param {object} [options]: optional settings
   */
  async insertMany(docs, options) {
    for (const doc of docs) {
      doc._id = await this.verifyOrGenerateId(doc);
      if (this.settings.defaultHook) {
        // TODO: ADD USER ID HERE
        // const userId = Account.userId();
        // if (userId) doc.createdBy = userId;
        doc.createdAt = moment().valueOf();
      }
    }
    return this.collection.insertMany(await Promise.all(docs), options);
  }

  /**
   * Find
   * @param {object} query: query to find documents
   * @param {object} [options]: optional settings
   */
  async find(query, options) {
    await this.ensureDbConnection();
    return this.collection.find(query, options);
  }

  /**
   * Find One
   * @param {object} query: query to find one document
   * @param {object} [options]: optional settings
   */
  async findOne(query, options) {
    await this.ensureDbConnection();
    return this.collection.findOne(query, options);
  }

  /**
   * Find One And Update
   * @param {object} query: query to select the document to update
   * @param {object} update: update operation to multiple documents
   * @param {object} [options]: optional settings
   */
  async findOneAndUpdate(query, update, options) {
    await this.ensureDbConnection();
    if (this.settings.defaultHook) {
      if (update.$set === undefined) update.$set = {};
      // const userId = Account.userId();
      // if (userId) update.$set.modifiedBy = userId;
      update.$set.modifiedAt = moment().valueOf();
    }
    return this.collection.findOneAndUpdate(query, update, options);
  }

  /**
   * Find One And Delete
   * @param {object} query: query to select the document to delete
   * @param {object} [options]: optional settings
   */
  async findOneAndDelete(query, options) {
    await this.ensureDbConnection();
    return this.collection.findOneAndDelete(query, options);
  }

  /**
   * Update One
   * @param {object} query: query to select the document to update
   * @param {object} update: update operation to single document
   * @param {object} [options]: optional settings
   */
  async updateOne(query, update, options) {
    await this.ensureDbConnection();
    if (this.settings.defaultHook) {
      if (update.$set === undefined) update.$set = {};
      // const userId = Account.userId();
      // if (userId) update.$set.modifiedBy = userId;
      update.$set.modifiedAt = moment().valueOf();
    }
    return this.collection.updateOne(query, update, options);
  }

  /**
   * Update Many
   * @param {object} query: query to select the document to update
   * @param {object} update: update operation to multiple documents
   * @param {object} [options]: optional settings
   */
  async updateMany(query, update, options) {
    await this.ensureDbConnection();
    if (this.settings.defaultHook) {
      if (update.$set === undefined) update.$set = {};
      // const userId = Account.userId();
      // if (userId) update.$set.modifiedBy = userId;
      update.$set.modifiedAt = moment().valueOf();
    }
    return this.collection.updateMany(query, update, options);
  }

  /**
   * Delete One
   * @param {object} query: query to delete one document
   * @param {object} [options]: optional settings
   */
  async deleteOne(query, options) {
    await this.ensureDbConnection();
    return this.collection.deleteOne(query, options);
  }

  /**
   * Delete Many
   * @param {object} query: query to delete multiple documents
   * @param {object} [options]: optional settings
   */
  async deleteMany(query, options) {
    await this.ensureDbConnection();
    return this.collection.deleteMany(query, options);
  }

  /**
   * Count documents
   * @param {object} query: query to count documents
   * @param {object} [options]: optional settings
   */
  async countDocuments(query, options) {
    await this.ensureDbConnection();
    return this.collection.countDocuments(query, options);
  }

  /**
   * Aggregate
   * @param {array} pipeline: array of pipeline object
   * @param {object} [options]: optional settings
   */
  async aggregate(pipeline, options = {}) {
    await this.ensureDbConnection();
    options.allowDiskUse = true;
    return this.collection.aggregate(pipeline, options);
  }

  async distinct(field, query = {}, options = {}) {
    await this.ensureDbConnection();
    return this.collection.distinct(field, query, options);
  }
}

module.exports = Collection;
