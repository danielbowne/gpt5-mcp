# Enhanced GPT-5 MCP Server Features

## Overview

Version 2.2.0 introduces significant resilience improvements to handle GPT-5's timeout issues and provide better support for longer reasoning tasks.

## New Features

### 🚀 Background Processing

Automatically handles long-running tasks that might timeout with synchronous requests.

- **Auto-enabled** for `reasoning_effort: 'high'`
- **Manual control** via `background: true` parameter
- **Polling system** checks response status until completion
- **Configurable timeouts** and polling intervals

### 🔄 Retry Logic

Smart retry mechanism with exponential backoff for socket errors.

- **Automatic retries** for socket hang up, connection reset, and timeout errors
- **Exponential backoff** with jitter to avoid thundering herd
- **Configurable retry attempts** (default: 3)
- **Non-retriable errors** fail immediately

### ⚙️ Enhanced Configuration

Fine-tune behavior for your specific use case.

```javascript
{
  background: boolean,           // Force background processing
  use_retry: boolean,            // Enable/disable retry logic (default: true)
  max_retries: number,           // Maximum retry attempts (default: 3)
  polling_interval: number,      // Polling interval in ms (default: 5000)
  max_polling_time: number       // Max polling time in ms (default: 300000 = 5 min)
}
```

## Usage Examples

### Basic High-Reasoning Task (Auto-Background)

```javascript
// High reasoning effort automatically enables background processing
const result = await mcp.callTool('gpt5_generate', {
  input: 'Design a complex algorithm for optimal route planning',
  reasoning_effort: 'high'  // Auto-enables background processing
});
```

### Explicit Background Processing

```javascript
const result = await mcp.callTool('gpt5_generate', {
  input: 'Analyze this large dataset',
  background: true,
  max_polling_time: 600000,  // 10 minutes
  polling_interval: 10000    // Check every 10 seconds
});
```

### Custom Retry Configuration

```javascript
const result = await mcp.callTool('gpt5_generate', {
  input: 'Simple query',
  use_retry: true,
  max_retries: 5,
  reasoning_effort: 'low'
});
```

### Disable Resilience Features

```javascript
const result = await mcp.callTool('gpt5_generate', {
  input: 'Quick response needed',
  background: false,
  use_retry: false,
  reasoning_effort: 'low'
});
```

## How It Works

### Background Processing Flow

1. **Request Submission**: Sends request with `background: true`
2. **Response ID**: Receives response ID from OpenAI
3. **Status Polling**: Continuously polls `/v1/responses/{id}` endpoint
4. **Completion Detection**: Returns final result when status is 'completed'
5. **Error Handling**: Handles 'failed', 'cancelled', and 'incomplete' states

### Retry Logic Flow

1. **Error Detection**: Identifies socket errors (hang up, reset, timeout)
2. **Retry Decision**: Non-socket errors fail immediately
3. **Backoff Calculation**: Exponential backoff with random jitter
4. **Retry Attempt**: Re-executes the entire request
5. **Final Failure**: All retries exhausted, throws last error

## Benefits

- ✅ **Eliminates 2-minute socket timeouts** for complex reasoning tasks
- ✅ **Handles network instability** with smart retry logic
- ✅ **Configurable behavior** for different use cases
- ✅ **Backward compatible** with existing integrations
- ✅ **Transparent operation** - same API, better reliability

## Monitoring

Enhanced logging provides visibility into the resilience features:

```
GPT-5 Generate (background): "Complex reasoning task..."
Background response initiated with ID: resp_123, polling for completion...
Response resp_123 status: in_progress, continuing to poll...
Background response completed: {...}
```

## Migration Notes

Existing code continues to work unchanged. New parameters are optional and provide enhanced capabilities when needed.

For optimal reliability with complex tasks, consider explicitly setting:
- `reasoning_effort: 'high'` for complex reasoning
- `background: true` for tasks expected to take >1 minute
- `max_polling_time: 600000` for very complex tasks (10 minutes)