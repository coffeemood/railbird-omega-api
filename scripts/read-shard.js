#!/usr/bin/env node

/**
 * Read and pop one hand from a shard file
 * 
 * Usage: ./read-shard.js <shard_file>
 * 
 * Returns: JSON object of one hand (printed to stdout)
 * Side effect: Removes that hand from the shard file
 */

const fs = require('fs');
const path = require('path');

async function readAndPopFromShard(shardFile) {
    try {
        // Read the entire file
        const content = fs.readFileSync(shardFile, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        
        if (lines.length === 0) {
            // Shard is empty
            console.error('SHARD_EMPTY');
            process.exit(1);
        }
        
        // Get the first line (the hand to process)
        const firstLine = lines[0];
        
        // Write back all remaining lines
        const remainingLines = lines.slice(1);
        if (remainingLines.length > 0) {
            fs.writeFileSync(shardFile, remainingLines.join('\n') + '\n');
        } else {
            // File is now empty, write empty file
            fs.writeFileSync(shardFile, '');
        }
        
        // Output the hand to stdout
        console.log(firstLine);
        
    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

// Main execution
const shardFile = process.argv[2];

if (!shardFile) {
    console.error('Usage: ./read-shard.js <shard_file>');
    process.exit(1);
}

// Make it executable from training-data directory
const fullPath = shardFile.includes('/') ? shardFile : path.join(__dirname, '../training-data', shardFile);

if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
}

readAndPopFromShard(fullPath);