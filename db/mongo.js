const { MongoClient, ServerApiVersion } = require('mongodb');
// const { dbString, dbName } = require('../settings');

class Mongo {
  /**
   * Constructor
   */
  constructor() {
    // Singleton db instance and client
    this.dbInstance = null;
    this.client = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  /**
   *  Init mongo db only once and reuse in application
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        if (!this.dbInstance) {
          console.log(`Connecting to MongoDB with url: ${process.env.DB_STRING}`);
          this.client = await MongoClient.connect(process.env.DB_STRING, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true, 
            serverApi: {
              version: ServerApiVersion.v1,
              strict: false,
              deprecationErrors: false,
            }
          });
          this.dbInstance = this.client.db(process.env.DB_NAME);
          this.isInitialized = true;
          console.log('Connected to MongoDB');
          resolve(this.dbInstance);
        } else {
          resolve(this.dbInstance);
        }
      } catch (error) {
        reject(error);
      }
    });
    
    return this.initPromise;
  }

  /**
   * Get mongo db
   */
  db() {
    if (!this.isInitialized) {
      throw new Error('MongoDB not initialized. Call init() first and await its completion.');
    }
    return this.dbInstance;
  }
}

module.exports = new Mongo();
