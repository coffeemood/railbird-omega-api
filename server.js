/**
 * Poker Analysis API Server
 * 
 * This server provides endpoints for analyzing poker hands and ranges
 * based on GTO-solved nodes from the database.
 */
const express = require('express');
const cors = require('cors');
const glob = require('glob');
const Account = require('./utils/globals/Account');
require('dotenv').config();

// Import database connection
const mongo = require('./db/mongo');


// Import routes

const app = express();

(async () => {
  try {
    await mongo.init();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
  
  // Initialize express app
  const apiRoutes = require('./routes/api');

  global.Account = Account;
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(require('./global'));
  
  // API Documentation
  glob.sync('./src/routes/**/*.js').forEach((file) => {
    try {
      app.use(require(path.resolve(file)));
    } catch (err) {
      console.log(file, err);
    }
  });
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'Server error', message: err.message });
  });
  
  // Set port and start server
  const PORT = process.env.PORT || 9000;

  try {
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
      console.log(`API documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
})();