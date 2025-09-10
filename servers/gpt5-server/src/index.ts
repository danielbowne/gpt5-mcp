#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { callGPT5, callGPT5WithMessages } from './utils.js';

// Initialize environment from parent directory
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });
console.error("Environment loaded from:", envPath);

// Schema definitions
const GPT5GenerateSchema = z.object({
  input: z.string().describe("The input text or prompt for GPT-5"),
  model: z.string().optional().default("gpt-5").describe("GPT-5 model variant to use"),
  instructions: z.string().optional().describe("System instructions for the model"),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level"),
  max_tokens: z.number().optional().describe("Maximum tokens to generate"),
  temperature: z.number().min(0).max(2).optional().describe("Temperature for randomness (0-2)"),
  top_p: z.number().min(0).max(1).optional().describe("Top-p sampling parameter"),
  background: z.boolean().optional().describe("Use background processing for long-running tasks (auto-enabled for high reasoning effort)"),
  use_retry: z.boolean().optional().default(true).describe("Enable retry logic for socket errors"),
  max_retries: z.number().optional().default(3).describe("Maximum number of retries"),
  polling_interval: z.number().optional().default(5000).describe("Polling interval in ms for background responses"),
  max_polling_time: z.number().optional().default(300000).describe("Maximum polling time in ms (default: 5 minutes)")
});

const GPT5MessagesSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'developer', 'assistant']).describe("Message role"),
    content: z.string().describe("Message content")
  })).describe("Array of conversation messages"),
  model: z.string().optional().default("gpt-5").describe("GPT-5 model variant to use"),
  instructions: z.string().optional().describe("System instructions for the model"),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level"),
  max_tokens: z.number().optional().describe("Maximum tokens to generate"),
  temperature: z.number().min(0).max(2).optional().describe("Temperature for randomness (0-2)"),
  top_p: z.number().min(0).max(1).optional().describe("Top-p sampling parameter"),
  background: z.boolean().optional().describe("Use background processing for long-running tasks (auto-enabled for high reasoning effort)"),
  use_retry: z.boolean().optional().default(true).describe("Enable retry logic for socket errors"),
  max_retries: z.number().optional().default(3).describe("Maximum number of retries"),
  polling_interval: z.number().optional().default(5000).describe("Polling interval in ms for background responses"),
  max_polling_time: z.number().optional().default(300000).describe("Maximum polling time in ms (default: 5 minutes)")
});

// Type definitions
type GPT5GenerateArgs = z.infer<typeof GPT5GenerateSchema>;
type GPT5MessagesArgs = z.infer<typeof GPT5MessagesSchema>;

// Main function
async function main() {
  // Check if OPENAI_API_KEY is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in .env file or as an environment variable');
    process.exit(1);
  }

  // Create MCP server using the modern McpServer class
  const server = new McpServer({
    name: "gpt5-server",
    version: "0.1.0"
  });

  // Register the gpt5_generate tool
  server.registerTool(
    "gpt5_generate",
    {
      title: "GPT-5 Generate",
      description: "Generate text using OpenAI GPT-5 API with enhanced resilience for longer tasks",
      inputSchema: {
        input: z.string().describe("The input text or prompt for GPT-5"),
        model: z.string().optional().default("gpt-5").describe("GPT-5 model variant to use"),
        instructions: z.string().optional().describe("System instructions for the model"),
        reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level"),
        max_tokens: z.number().optional().describe("Maximum tokens to generate"),
        temperature: z.number().min(0).max(2).optional().describe("Temperature for randomness (0-2)"),
        top_p: z.number().min(0).max(1).optional().describe("Top-p sampling parameter"),
        background: z.boolean().optional().describe("Use background processing for long-running tasks (auto-enabled for high reasoning effort)"),
        use_retry: z.boolean().optional().default(true).describe("Enable retry logic for socket errors"),
        max_retries: z.number().optional().default(3).describe("Maximum number of retries"),
        polling_interval: z.number().optional().default(5000).describe("Polling interval in ms for background responses"),
        max_polling_time: z.number().optional().default(300000).describe("Maximum polling time in ms (default: 5 minutes)")
      }
    },
    async (args: GPT5GenerateArgs) => {
      const processingMode = args.background || args.reasoning_effort === 'high' ? 'background' : 'synchronous';
      console.error(`GPT-5 Generate (${processingMode}): "${args.input.substring(0, 100)}..."`);
      
      try {
        const result = await callGPT5(process.env.OPENAI_API_KEY!, args.input, {
          model: args.model,
          instructions: args.instructions,
          reasoning_effort: args.reasoning_effort,
          max_tokens: args.max_tokens,
          temperature: args.temperature,
          top_p: args.top_p,
          background: args.background,
          use_retry: args.use_retry,
          max_retries: args.max_retries,
          polling_interval: args.polling_interval,
          max_polling_time: args.max_polling_time
        });
        
        let responseText = result.content;
        if (result.usage) {
          responseText += `\n\n**Usage:** ${result.usage.prompt_tokens} prompt tokens, ${result.usage.completion_tokens} completion tokens, ${result.usage.total_tokens} total tokens`;
        }
        
        return {
          content: [{
            type: "text" as const,
            text: responseText
          }]
        };
      } catch (error) {
        console.error("ERROR during GPT-5 API call:", error);
        
        return {
          content: [{
            type: "text" as const,
            text: `GPT-5 API error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Register the gpt5_messages tool
  server.registerTool(
    "gpt5_messages",
    {
      title: "GPT-5 Messages",
      description: "Generate text using GPT-5 with structured conversation messages and enhanced resilience",
      inputSchema: {
        messages: z.array(z.object({
          role: z.enum(['user', 'developer', 'assistant']).describe("Message role"),
          content: z.string().describe("Message content")
        })).describe("Array of conversation messages"),
        model: z.string().optional().default("gpt-5").describe("GPT-5 model variant to use"),
        instructions: z.string().optional().describe("System instructions for the model"),
        reasoning_effort: z.enum(['low', 'medium', 'high']).optional().describe("Reasoning effort level"),
        max_tokens: z.number().optional().describe("Maximum tokens to generate"),
        temperature: z.number().min(0).max(2).optional().describe("Temperature for randomness (0-2)"),
        top_p: z.number().min(0).max(1).optional().describe("Top-p sampling parameter"),
        background: z.boolean().optional().describe("Use background processing for long-running tasks (auto-enabled for high reasoning effort)"),
        use_retry: z.boolean().optional().default(true).describe("Enable retry logic for socket errors"),
        max_retries: z.number().optional().default(3).describe("Maximum number of retries"),
        polling_interval: z.number().optional().default(5000).describe("Polling interval in ms for background responses"),
        max_polling_time: z.number().optional().default(300000).describe("Maximum polling time in ms (default: 5 minutes)")
      }
    },
    async (args: GPT5MessagesArgs) => {
      const processingMode = args.background || args.reasoning_effort === 'high' ? 'background' : 'synchronous';
      console.error(`GPT-5 Messages (${processingMode}): ${args.messages.length} messages`);
      
      try {
        const result = await callGPT5WithMessages(process.env.OPENAI_API_KEY!, args.messages, {
          model: args.model,
          instructions: args.instructions,
          reasoning_effort: args.reasoning_effort,
          max_tokens: args.max_tokens,
          temperature: args.temperature,
          top_p: args.top_p,
          background: args.background,
          use_retry: args.use_retry,
          max_retries: args.max_retries,
          polling_interval: args.polling_interval,
          max_polling_time: args.max_polling_time
        });
        
        let responseText = result.content;
        if (result.usage) {
          responseText += `\n\n**Usage:** ${result.usage.prompt_tokens} prompt tokens, ${result.usage.completion_tokens} completion tokens, ${result.usage.total_tokens} total tokens`;
        }
        
        return {
          content: [{
            type: "text" as const,
            text: responseText
          }]
        };
      } catch (error) {
        console.error("ERROR during GPT-5 API call:", error);
        
        return {
          content: [{
            type: "text" as const,
            text: `GPT-5 API error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Set up graceful shutdown for both SIGINT and SIGTERM
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, async () => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    });
  });

  // Start the server
  console.error("Starting GPT-5 MCP server");
  
  try {
    const transport = new StdioServerTransport();
    console.error("StdioServerTransport created");
    
    await server.connect(transport);
    console.error("Server connected to transport");
    
    console.error("GPT-5 MCP server running on stdio");
  } catch (error) {
    console.error("ERROR starting server:", error);
    throw error;
  }
}

// Main execution
main().catch(error => {
  console.error("Server runtime error:", error);
  process.exit(1);
});