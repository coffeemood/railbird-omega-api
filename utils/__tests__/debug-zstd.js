const fs = require('fs');
const path = require('path');

// Import NAPI functions to test step by step
const { 
    decodeCompressedNode,
    decompressZstd,
    decodeCompactNode
} = require('../solver-node');

// Load test.zstd file
const testZstdPath = path.join(__dirname, 'test.zstd');
const testZstdData = fs.readFileSync(testZstdPath);

console.log('=== DEBUGGING test.zstd ===');
console.log('File size:', testZstdData.length, 'bytes');
console.log('First 20 bytes:', Array.from(testZstdData.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

// Check zstd magic header (should be 28 b5 2f fd)
const magic = testZstdData.slice(0, 4);
const expectedMagic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
console.log('Zstd magic check:', magic.equals(expectedMagic) ? '✅ Valid' : '❌ Invalid');

console.log('\n=== TESTING STEP-BY-STEP DECODING ===');

try {
    console.log('1. Testing decodeCompressedNode (combined function)...');
    const result1 = decodeCompressedNode(testZstdData);
    console.log('✅ decodeCompressedNode succeeded');
    console.log('Result type:', typeof result1);
    console.log('Result length:', result1.length);
    
    try {
        const parsed = JSON.parse(result1);
        console.log('✅ JSON parsing succeeded');
        console.log('Parsed object keys:', Object.keys(parsed));
        if (parsed.node_id) {
            console.log('Node ID:', parsed.node_id);
        }
    } catch (jsonError) {
        console.log('❌ JSON parsing failed:', jsonError.message);
        console.log('Raw result (first 200 chars):', result1.substring(0, 200));
    }
    
} catch (error1) {
    console.log('❌ decodeCompressedNode failed:', error1.message);
    
    // Try step-by-step approach
    console.log('\n2. Testing step-by-step decompression...');
    
    try {
        console.log('2a. Testing decompressZstd...');
        const decompressed = decompressZstd(testZstdData);
        console.log('✅ decompressZstd succeeded');
        console.log('Decompressed size:', decompressed.length, 'bytes');
        console.log('First 20 bytes of decompressed:', Array.from(decompressed.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        
        try {
            console.log('2b. Testing decodeCompactNode on decompressed data...');
            const result2 = decodeCompactNode(decompressed);
            console.log('✅ decodeCompactNode succeeded');
            console.log('Result type:', typeof result2);
            
            try {
                const parsed2 = JSON.parse(result2);
                console.log('✅ JSON parsing succeeded');
                console.log('Parsed object keys:', Object.keys(parsed2));
            } catch (jsonError2) {
                console.log('❌ JSON parsing failed:', jsonError2.message);
            }
            
        } catch (error2b) {
            console.log('❌ decodeCompactNode failed:', error2b.message);
            
            // Check if decompressed data looks like valid bincode
            console.log('\n=== ANALYZING DECOMPRESSED DATA ===');
            console.log('First 100 bytes as hex:');
            console.log(Array.from(decompressed.slice(0, 100)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            
            console.log('\nFirst 100 bytes as text (showing printable chars):');
            const text = Array.from(decompressed.slice(0, 100)).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
            console.log(text);
        }
        
    } catch (error2a) {
        console.log('❌ decompressZstd failed:', error2a.message);
    }
}

console.log('\n=== TESTING WITH NODE.JS ZSTD ===');

try {
    // Try using Node.js zstd library as comparison
    const zstd = require('simple-zstd');
    const nodeDecompressed = zstd.decompress(testZstdData);
    console.log('✅ Node.js zstd decompression succeeded');
    console.log('Node.js decompressed size:', nodeDecompressed.length, 'bytes');
    
    // Compare with Rust decompression
    try {
        const rustDecompressed = decompressZstd(testZstdData);
        console.log('Size comparison - Node.js:', nodeDecompressed.length, 'vs Rust:', rustDecompressed.length);
        console.log('Data identical:', nodeDecompressed.equals(rustDecompressed) ? '✅ Yes' : '❌ No');
        
        if (!nodeDecompressed.equals(rustDecompressed)) {
            console.log('First 50 bytes Node.js:', Array.from(nodeDecompressed.slice(0, 50)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            console.log('First 50 bytes Rust:   ', Array.from(rustDecompressed.slice(0, 50)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        }
    } catch (rustError) {
        console.log('Rust decompression failed, but Node.js succeeded');
    }
    
} catch (nodeZstdError) {
    console.log('❌ Node.js zstd failed:', nodeZstdError.message);
}