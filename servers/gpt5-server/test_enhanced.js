#!/usr/bin/env node

// Simple test script to verify the enhanced GPT-5 MCP server functionality
// This demonstrates the new background processing and retry capabilities

import { callGPT5 } from './build/utils.js';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '../../.env' });

async function testEnhancedFeatures() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('🧪 Testing Enhanced GPT-5 MCP Server Features\n');
  
  // Test 1: Basic synchronous call
  console.log('1. Testing basic synchronous call...');
  try {
    const result1 = await callGPT5(apiKey, 'Say "Hello from enhanced GPT-5 server!"', {
      reasoning_effort: 'low',
      background: false,
      max_retries: 1
    });
    console.log('✅ Synchronous call successful');
    console.log('Response:', result1.content.substring(0, 100) + '...\n');
  } catch (error) {
    console.error('❌ Synchronous call failed:', error.message, '\n');
  }

  // Test 2: Background processing (auto-enabled for high reasoning)
  console.log('2. Testing background processing (high reasoning effort)...');
  try {
    const result2 = await callGPT5(apiKey, 'Explain quantum computing in simple terms', {
      reasoning_effort: 'high', // This should auto-enable background processing
      max_polling_time: 60000,  // 1 minute timeout for test
      polling_interval: 3000    // Check every 3 seconds
    });
    console.log('✅ Background processing successful');
    console.log('Response:', result2.content.substring(0, 100) + '...\n');
  } catch (error) {
    console.error('❌ Background processing failed:', error.message, '\n');
  }

  // Test 3: Explicit background processing
  console.log('3. Testing explicit background processing...');
  try {
    const result3 = await callGPT5(apiKey, 'Write a short poem about coding', {
      background: true,
      reasoning_effort: 'medium',
      max_polling_time: 60000,
      polling_interval: 3000
    });
    console.log('✅ Explicit background processing successful');
    console.log('Response:', result3.content.substring(0, 100) + '...\n');
  } catch (error) {
    console.error('❌ Explicit background processing failed:', error.message, '\n');
  }

  console.log('🎉 Enhanced feature testing complete!');
}

// Run the test
testEnhancedFeatures().catch(console.error);