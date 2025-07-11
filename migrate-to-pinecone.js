#!/usr/bin/env node

/**
 * Single-use migration script to transfer lean_meta_v2 documents from MongoDB to Pinecone
 * 
 * This script:
 * 1. Connects to MongoDB and fetches all documents from lean_meta_v2 collection
 * 2. Transforms the documents to Pinecone format
 * 3. Uploads vectors to Pinecone in batches
 * 4. Provides progress tracking and error handling
 * 
 * Usage: node migrate-to-pinecone.js
 * 
 * Required environment variables:
 * - DB_STRING: MongoDB connection string
 * - DB_NAME: MongoDB database name
 * - PINECONE_API_KEY: Pinecone API key
 * - PINECONE_INDEX_NAME: Pinecone index name (default: railbird-solver-nodes)
 * - MONGODB_VECTOR_COLLECTION: MongoDB collection name (default: lean_meta_v2)
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { Pinecone } = require('@pinecone-database/pinecone');

// Configuration
const BATCH_SIZE = 1000; // Pinecone batch upsert limit
const MONGODB_COLLECTION = process.env.MONGODB_VECTOR_COLLECTION || 'lean_meta_v3';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'railbird-solver-nodes';

class PineconeMigrator {
  constructor() {
    this.mongoClient = null;
    this.pinecone = null;
    this.index = null;
    this.stats = {
      totalDocuments: 0,
      processedDocuments: 0,
      successfulUpserts: 0,
      failedUpserts: 0,
      startTime: null,
      endTime: null
    };
  }

  async init() {
    console.log('🚀 Initializing migration...');
    
    // Initialize MongoDB connection
    this.mongoClient = new MongoClient(process.env.DB_STRING, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await this.mongoClient.connect();
    console.log('✅ Connected to MongoDB');

    // Initialize Pinecone connection
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    this.index = this.pinecone.index(PINECONE_INDEX_NAME);
    console.log(`✅ Connected to Pinecone index: ${PINECONE_INDEX_NAME}`);
  }

  async getDocumentCount() {
    const db = this.mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(MONGODB_COLLECTION);
    return await collection.countDocuments();
  }

  async *getDocumentsBatch() {
    const db = this.mongoClient.db(process.env.DB_NAME);
    const collection = db.collection(MONGODB_COLLECTION);
    
    const cursor = collection.find({});
    const batch = [];
    
    for await (const document of cursor) {
      batch.push(document);
      
      if (batch.length >= BATCH_SIZE) {
        yield batch.splice(0, BATCH_SIZE);
      }
    }
    
    // Yield remaining documents
    if (batch.length > 0) {
      yield batch;
    }
  }

  transformDocumentToPinecone(doc) {
    // Pad 61-dimension vector to match Pinecone index dimension (512)
    const originalVector = doc.vector;
    const targetDimension = 512;
    const paddedVector = [...originalVector];
    
    // Pad with zeros to reach target dimension
    while (paddedVector.length < targetDimension) {
      paddedVector.push(0.0);
    }
    
    // Transform MongoDB document to Pinecone format
    const pineconeDoc = {
      id: doc._id.toString(), // Use MongoDB _id as Pinecone ID
      values: paddedVector, // Padded vector to match index dimension
      metadata: {
        // Store all the metadata fields for filtering and retrieval
        // original_node_id: doc.original_node_id,
        flop_basename: doc.flop_basename,
        s3_bucket: doc.s3_bucket,
        s3_key: doc.s3_key,
        offset: doc.offset,
        length: doc.length,
        street: doc.street,
        game_type: doc.game_type,
        pot_type: doc.pot_type,
        positions: doc.positions.join(','),
        board_tex: doc.board_tex.join(','),
        pos_flag: doc.pos_flag, 
        stack_bb: doc.stack_bb,
        stack_bb_solve: doc.stack_bb_solve,
        pot_bb: doc.pot_bb,
        act_hash: doc.act_hash,
        // tag_ids: doc.tag_ids
      }
    };

    return pineconeDoc;
  }

  async upsertBatch(documents) {
    try {
      const pineconeDocuments = documents.map(doc => this.transformDocumentToPinecone(doc));
      
      await this.index.upsert(pineconeDocuments);
      
      this.stats.successfulUpserts += documents.length;
      return { success: true, count: documents.length };
    } catch (error) {
      console.error(`❌ Failed to upsert batch of ${documents.length} documents:`, error.message);
      this.stats.failedUpserts += documents.length;
      return { success: false, error: error.message, count: documents.length };
    }
  }

  async migrate() {
    this.stats.startTime = new Date();
    
    console.log('📊 Counting documents...');
    this.stats.totalDocuments = await this.getDocumentCount();
    console.log(`📊 Total documents to migrate: ${this.stats.totalDocuments}`);
    
    if (this.stats.totalDocuments === 0) {
      console.log('⚠️  No documents found to migrate');
      return;
    }

    console.log('🔄 Starting migration...');
    
    let batchNumber = 0;
    for await (const batch of this.getDocumentsBatch()) {
      batchNumber++;
      const result = await this.upsertBatch(batch);
      
      this.stats.processedDocuments += batch.length;
      
      const progress = ((this.stats.processedDocuments / this.stats.totalDocuments) * 100).toFixed(1);
      
      if (result.success) {
        console.log(`✅ Batch ${batchNumber}: ${result.count} documents (${progress}% complete)`);
      } else {
        console.log(`❌ Batch ${batchNumber}: Failed ${result.count} documents (${progress}% complete)`);
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.stats.endTime = new Date();
    this.printSummary();
  }

  printSummary() {
    const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);
    
    console.log('\n🎉 Migration completed!');
    console.log('================================');
    console.log(`📊 Total documents: ${this.stats.totalDocuments}`);
    console.log(`✅ Successfully migrated: ${this.stats.successfulUpserts}`);
    console.log(`❌ Failed migrations: ${this.stats.failedUpserts}`);
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`🚀 Rate: ${Math.round(this.stats.totalDocuments / duration)} docs/sec`);
    
    if (this.stats.failedUpserts > 0) {
      console.log('\n⚠️  Some documents failed to migrate. Check the logs above for details.');
      process.exit(1);
    }
  }

  async cleanup() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

// Main execution
async function main() {
  // Validate required environment variables
  const requiredEnvVars = ['DB_STRING', 'DB_NAME', 'PINECONE_API_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
  }

  const migrator = new PineconeMigrator();
  
  try {
    await migrator.init();
    await migrator.migrate();
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await migrator.cleanup();
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Migration interrupted by user');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  process.exit(1);
});

// Run the migration
if (require.main === module) {
  main();
}

module.exports = PineconeMigrator;